import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import {
  bootstrapFacilityReferralIntake,
  ensureReferralChecklist,
  resolveIntakeOwnerUserId,
} from "@/lib/crm/facility-referral-intake";
import {
  matchReferringFacilityFromPublicForm,
  referralSourceMatchAutoAttachThreshold,
} from "@/lib/crm/facility-referral-source-match";
import {
  countRecentSubmissionsByIpHash,
  getUniversalSourceLink,
  recordSourceLinkEvent,
  resolveSourceLinkByToken,
  appendPacketRequestReferralLead,
} from "@/lib/crm/facility-referral-source-links";
import {
  notifyFacilityReferralCreated,
  notifyPacketReferralLinkSubmitted,
  notifyReferralSourceReviewNeeded,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import { getCrmCalendarTomorrowIso } from "@/lib/crm/crm-local-date";
import { handleNewLeadCreated } from "@/lib/crm/post-create-lead-workflow";
import type { PublicReferralSubmitPayload, PublicReferralSubmitResult } from "@/lib/crm/public-referral-types";
import { isValidServiceDisciplineCode } from "@/lib/crm/service-disciplines";
import type { StaffProfile } from "@/lib/staff-profile";
import { normalizePhone } from "@/lib/phone/us-phone-format";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseServiceDisciplines(serviceNeeded: string): string[] {
  const t = serviceNeeded.trim();
  if (!t || t.toLowerCase() === "other" || t.toLowerCase() === "wound care") return [];
  if (t.toUpperCase() === "SN" && isValidServiceDisciplineCode("RN")) return ["RN"];
  if (isValidServiceDisciplineCode(t)) return [t];
  return [];
}

function serviceTypeLabel(serviceNeeded: string): string {
  const t = serviceNeeded.trim();
  if (t.toLowerCase() === "wound care") return "Wound care";
  return t;
}

async function resolveSystemActorUserId(fallbackRepId: string | null): Promise<string | null> {
  if (fallbackRepId && UUID_RE.test(fallbackRepId)) return fallbackRepId;
  const { data } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, role, is_active")
    .eq("is_active", true)
    .in("role", ["super_admin", "admin", "manager"])
    .limit(1)
    .maybeSingle();
  return typeof data?.user_id === "string" ? data.user_id : null;
}

async function bootstrapUnmatchedReferralIntake(input: {
  leadId: string;
  createdBy: string;
}): Promise<void> {
  await ensureReferralChecklist(supabaseAdmin, {
    leadId: input.leadId,
    facilityId: null,
    updatedBy: input.createdBy,
  });

  const dueToday = new Date();
  dueToday.setHours(17, 0, 0, 0);
  const dueTomorrow = new Date(`${getCrmCalendarTomorrowIso()}T17:00:00`).toISOString();

  const tasks = [
    {
      title: "Contact patient — printed QR referral",
      description: "Initial outreach for referral submitted via universal printed QR.",
      dueAt: dueToday.toISOString(),
    },
    {
      title: "Verify insurance — printed QR referral",
      description: "Confirm payer eligibility.",
      dueAt: dueToday.toISOString(),
    },
    {
      title: "Review referral source — printed QR",
      description: "Match typed referring office to a facility in the portal.",
      dueAt: dueTomorrow,
    },
  ];

  for (const task of tasks) {
    const { data: existing } = await supabaseAdmin
      .from("crm_tasks")
      .select("id, title")
      .eq("related_entity_type", "lead")
      .eq("related_entity_id", input.leadId)
      .in("status", ["open", "in_progress", "blocked"])
      .limit(20);

    const needle = task.title.toLowerCase();
    if ((existing ?? []).some((r) => String((r as { title?: string }).title ?? "").toLowerCase().includes(needle))) {
      continue;
    }

    await supabaseAdmin.from("crm_tasks").insert({
      title: task.title,
      description: task.description,
      status: "open",
      priority: "high",
      due_at: task.dueAt,
      related_entity_type: "lead",
      related_entity_id: input.leadId,
      assigned_to: null,
      created_by: input.createdBy,
      source: "manual",
    });
  }
}

export async function submitPublicReferral(input: {
  payload: PublicReferralSubmitPayload;
  ipHash?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
}): Promise<PublicReferralSubmitResult> {
  const { payload } = input;

  if (input.ipHash) {
    const recent = await countRecentSubmissionsByIpHash(input.ipHash, 60);
    if (recent >= 8) {
      return { ok: false, error: "rate_limited" };
    }
  }

  const universalLink = await getUniversalSourceLink();
  const tokenLinkRaw = payload.token ? await resolveSourceLinkByToken(payload.token) : null;
  const tokenLink = tokenLinkRaw?.status === "active" ? tokenLinkRaw : null;
  const sourceLinkId = tokenLink?.id ?? universalLink?.id ?? null;
  const tokenSegment = payload.token ?? tokenLink?.short_slug ?? tokenLink?.token ?? null;

  await recordSourceLinkEvent({
    sourceLinkId,
    token: tokenSegment,
    eventType: "form_submitted",
    facilityId: tokenLink?.facility_id ?? null,
    contactId: tokenLink?.contact_id ?? null,
    campaignId: tokenLink?.campaign_id ?? null,
    salesRepId: tokenLink?.sales_rep_id ?? null,
    ipHash: input.ipHash ?? null,
    userAgent: input.userAgent,
    referrer: input.referrer,
    metadata: {
      source: payload.source ?? tokenLink?.default_source ?? "printed_materials",
      link_type: tokenLink?.link_type ?? null,
    },
  });

  const match = await matchReferringFacilityFromPublicForm({
    referring_facility_name: payload.referring_facility_name,
    referring_contact_name: payload.referring_contact_name,
    referring_contact_phone: payload.referring_contact_phone,
    referring_contact_email: payload.referring_contact_email,
    referring_office_city: payload.referring_office_city,
    referring_office_phone: payload.referring_office_phone,
  });

  const autoThreshold = referralSourceMatchAutoAttachThreshold();

  let facilityId = tokenLink?.facility_id ?? null;
  let facilityContactId = tokenLink?.contact_id ?? null;

  if (!facilityId && match.matched_facility_id && match.confidence >= autoThreshold) {
    facilityId = match.matched_facility_id;
    facilityContactId = facilityContactId ?? match.matched_contact_id;
  } else if (
    facilityId &&
    !facilityContactId &&
    match.matched_facility_id === facilityId &&
    match.confidence >= autoThreshold
  ) {
    facilityContactId = match.matched_contact_id;
  }

  let facilityName = payload.referring_facility_name.trim();
  let salesRepId: string | null = tokenLink?.sales_rep_id ?? null;

  if (facilityId) {
    const { data: facility } = await supabaseAdmin
      .from("facilities")
      .select("id, name, assigned_rep_user_id")
      .eq("id", facilityId)
      .maybeSingle();
    if (facility?.id) {
      facilityName = String(facility.name ?? facilityName);
      salesRepId =
        salesRepId ??
        (typeof facility.assigned_rep_user_id === "string" ? facility.assigned_rep_user_id : null);
    } else {
      facilityId = null;
      facilityContactId = null;
    }
  }

  const matched = Boolean(facilityId);
  const needsReview = !matched;

  const firstName = payload.patient_first_name.trim();
  const lastName = payload.patient_last_name.trim();
  const patientName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Referral prospect";
  const primaryPhone = normalizePhone(payload.patient_phone);
  const dob = payload.patient_dob?.trim().slice(0, 10) || null;
  const payer = (payload.payer ?? "").trim() || null;
  const notes = (payload.notes ?? "").trim() || null;
  const disciplines = parseServiceDisciplines(payload.service_needed);
  const serviceLabel = serviceTypeLabel(payload.service_needed);
  const referralReceivedAt = new Date().toISOString();

  const isPacketLink = tokenLink?.link_type === "packet";
  const packetMaterialIds = isPacketLink
    ? Array.isArray(tokenLink?.metadata?.packet_material_ids)
      ? (tokenLink!.metadata!.packet_material_ids as string[]).filter((id) => typeof id === "string")
      : tokenLink?.packet_material_id
        ? [tokenLink.packet_material_id]
        : []
    : [];

  const referralSourceType = isPacketLink
    ? "packet_link"
    : matched
      ? "printed_qr"
      : "unmatched_printed_qr";

  const attribution = {
    channel: tokenLink ? "token_referral_form" : "public_referral_form",
    source: payload.source ?? tokenLink?.default_source ?? "printed_materials",
    source_link_id: sourceLinkId,
    token: tokenSegment,
    link_type: tokenLink?.link_type ?? null,
    link_label: tokenLink?.label ?? null,
    material_type: tokenLink?.material_type ?? null,
    campaign_id: tokenLink?.campaign_id ?? null,
    campaign_enrollment_id: tokenLink?.campaign_enrollment_id ?? null,
    packet_request_id: tokenLink?.packet_request_id ?? null,
    packet_material_id: tokenLink?.packet_material_id ?? null,
    packet_material_ids: packetMaterialIds,
    delivery_method:
      isPacketLink && typeof tokenLink?.metadata?.delivery_method === "string"
        ? tokenLink.metadata.delivery_method
        : null,
    route_plan_id: tokenLink?.route_plan_id ?? null,
    route_stop_id: tokenLink?.route_stop_id ?? null,
    activity_id: tokenLink?.activity_id ?? null,
    sales_rep_id: tokenLink?.sales_rep_id ?? salesRepId,
    typed_referring_facility_name: payload.referring_facility_name.trim(),
    typed_referring_contact_name: payload.referring_contact_name ?? null,
    typed_referring_contact_phone: payload.referring_contact_phone ?? null,
    typed_referring_contact_email: payload.referring_contact_email ?? null,
    typed_referring_office_city: payload.referring_office_city ?? null,
    typed_referring_office_phone: payload.referring_office_phone ?? null,
    facility_id: facilityId,
    facility_name: facilityName,
    contact_id: facilityContactId,
    match_confidence: match.confidence,
    match_reason: match.match_reason,
    possible_matches: match.possible_matches,
    service_needed: payload.service_needed,
    submitted_at: referralReceivedAt,
  };

  const { data: contactRow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .insert({
      full_name: patientName,
      primary_phone: primaryPhone || null,
    })
    .select("id")
    .single();

  if (cErr || !contactRow?.id) {
    console.warn("[public-referral-submit] contact insert:", cErr?.message);
    return { ok: false, error: "lead_failed" };
  }

  const contactIdInserted = contactRow.id as string;
  const actorUserId = await resolveSystemActorUserId(salesRepId);

  const { data: leadRow, error: lErr } = await supabaseAdmin
    .from("leads")
    .insert({
      contact_id: contactIdInserted,
      source: "facility_outreach",
      status: "new",
      owner_user_id: salesRepId,
      produced_by_user_id: salesRepId,
      consent_to_contact: true,
      dob,
      referring_facility_id: facilityId,
      referring_facility_contact_id: facilityContactId,
      referral_source_type: referralSourceType,
      referral_source: facilityName,
      referral_received_at: referralReceivedAt,
      referral_attribution_json: attribution,
      doctor_office_name: payload.referring_facility_name.trim(),
      primary_payer_name: payer,
      payer_name: payer,
      service_disciplines: disciplines,
      service_type: disciplines.length > 0 ? disciplines.join(", ") : serviceLabel,
      notes,
      needs_referral_source_review: needsReview,
      referral_source_match_confidence: match.confidence > 0 ? match.confidence : null,
      referral_source_match_reason: match.match_reason || null,
    })
    .select("id")
    .single();

  if (lErr || !leadRow?.id) {
    console.warn("[public-referral-submit] lead insert:", lErr?.message);
    await supabaseAdmin.from("contacts").delete().eq("id", contactIdInserted);
    return { ok: false, error: "lead_failed" };
  }

  const leadId = leadRow.id as string;

  await handleNewLeadCreated(supabaseAdmin, {
    leadId,
    contactId: contactIdInserted,
    intakeChannel: "other",
  });

  let activityId: string | null = null;
  let intakeOwnerId: string | null = null;

  if (matched && facilityId && actorUserId) {
    const { data: actRow, error: actErr } = await supabaseAdmin
      .from("facility_activities")
      .insert({
        facility_id: facilityId,
        facility_contact_id: facilityContactId,
        staff_user_id: salesRepId ?? actorUserId,
        activity_type: "Referral Received",
        outcome: "Referral Sent",
        activity_at: referralReceivedAt,
        notes: isPacketLink
          ? "Referral submitted through packet referral link."
          : tokenLink
            ? `Referral submitted through ${tokenLink.link_type} referral link.`
            : "Referral submitted through universal printed QR.",
        linked_lead_id: leadId,
        referral_created: true,
      })
      .select("id")
      .single();

    if (actErr) {
      console.warn("[public-referral-submit] activity insert:", actErr.message);
    } else if (actRow?.id) {
      activityId = String(actRow.id);
      await supabaseAdmin
        .from("leads")
        .update({ referring_facility_activity_id: activityId })
        .eq("id", leadId);
    }

    await supabaseAdmin
      .from("facilities")
      .update({ last_referral_at: referralReceivedAt })
      .eq("id", facilityId);

    intakeOwnerId = resolveIntakeOwnerUserId(
      { user_id: actorUserId, role: "manager" } as StaffProfile,
      { assigned_to_staff_id: null, owner_user_id: salesRepId }
    );

    await bootstrapFacilityReferralIntake(supabaseAdmin, {
      leadId,
      facilityId,
      facilityName,
      facilityContactId,
      salesRepId: salesRepId ?? actorUserId,
      createdBy: actorUserId,
      intakeOwnerId,
    });

    queueFacilityNotification(() =>
      notifyFacilityReferralCreated({
        leadId,
        facilityId,
        facilityName,
        patientName,
        intakeOwnerUserId: intakeOwnerId,
        salesRepUserId: salesRepId,
      })
    );

    if (isPacketLink) {
      queueFacilityNotification(() =>
        notifyPacketReferralLinkSubmitted({
          leadId,
          facilityId,
          facilityName,
          salesRepUserId: salesRepId ?? tokenLink?.sales_rep_id ?? null,
          packetRequestId: tokenLink?.packet_request_id ?? null,
        })
      );
    }

    if (tokenLink?.packet_request_id) {
      await appendPacketRequestReferralLead(tokenLink.packet_request_id, leadId);
    }
  } else if (actorUserId) {
    await bootstrapUnmatchedReferralIntake({ leadId, createdBy: actorUserId });

    queueFacilityNotification(() =>
      notifyReferralSourceReviewNeeded({
        leadId,
        patientName,
        typedFacilityName: payload.referring_facility_name.trim(),
      })
    );
  }

  await recordSourceLinkEvent({
    sourceLinkId,
    token: tokenSegment,
    eventType: "lead_created",
    facilityId,
    contactId: facilityContactId,
    campaignId: tokenLink?.campaign_id ?? null,
    salesRepId,
    leadId,
    ipHash: input.ipHash ?? null,
    metadata: {
      matched,
      needs_review: needsReview,
      referral_source_type: referralSourceType,
      link_type: tokenLink?.link_type ?? null,
    },
  });

  return {
    ok: true,
    lead_id: leadId,
    matched,
    needs_review: needsReview,
    facility_id: facilityId,
    contact_id: facilityContactId,
    source_link_id: sourceLinkId,
    patient_name: patientName,
    facility_name: matched ? facilityName : null,
    sales_rep_user_id: salesRepId,
    intake_owner_user_id: intakeOwnerId,
  };
}
