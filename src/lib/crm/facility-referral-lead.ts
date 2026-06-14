import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/admin";
import { staffLabelFromLookup, staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { findFacilityReferralDuplicateLeads } from "@/lib/crm/facility-referral-lead-duplicate-check";
import type {
  FacilityReferralAttributionSummary,
  FacilityReferralLeadInput,
} from "@/lib/crm/facility-referral-lead-types";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { handleNewLeadCreated } from "@/lib/crm/post-create-lead-workflow";
import { isValidLeadPipelineStatus } from "@/lib/crm/lead-pipeline-status";
import { isValidServiceDisciplineCode } from "@/lib/crm/service-disciplines";
import { getCrmCalendarTomorrowIso } from "@/lib/crm/crm-local-date";
import {
  bootstrapFacilityReferralIntake,
  resolveIntakeOwnerUserId,
} from "@/lib/crm/facility-referral-intake";
import {
  notifyFacilityReferralCreated,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import { pipelineStageForLeadStatus } from "@/lib/crm/facility-referral-pipeline-utils";
import { loadIntakeReadinessByLeadIds } from "@/lib/crm/lead-intake-readiness";
import type { StaffProfile } from "@/lib/staff-profile";
import { isManagerOrHigher } from "@/lib/staff-profile";
import { normalizePhone } from "@/lib/phone/us-phone-format";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseServiceDisciplines(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((d) => isValidServiceDisciplineCode(d));
  }
  const t = (raw ?? "").trim();
  if (!t || t.toLowerCase() === "other") return [];
  if (isValidServiceDisciplineCode(t)) return [t];
  if (t.toUpperCase() === "SN" && isValidServiceDisciplineCode("RN")) return ["RN"];
  return [];
}

function referralDateIso(input: string | null | undefined): string {
  if (input?.trim()) {
    const d = new Date(input);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

export type CreateFacilityReferralLeadResult =
  | {
      ok: true;
      lead: { id: string; status: string | null };
      facility: { id: string; name: string };
      activity: { id: string } | null;
      follow_up_task_id: string | null;
    }
  | {
      ok: false;
      error: string;
      duplicate_check?: boolean;
      possible_duplicates?: Awaited<ReturnType<typeof findFacilityReferralDuplicateLeads>>;
    };

export async function createFacilityReferralLead(
  staff: StaffProfile,
  input: FacilityReferralLeadInput
): Promise<CreateFacilityReferralLeadResult> {
  if (!isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const facilityId = (input.facility_id ?? "").trim();
  if (!facilityId || !UUID_RE.test(facilityId)) {
    return { ok: false, error: "invalid_facility_id" };
  }

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("id, name, assigned_rep_user_id")
    .eq("id", facilityId)
    .maybeSingle();

  if (!facility?.id) {
    return { ok: false, error: "facility_not_found" };
  }

  const facilityName = String(facility.name ?? "Facility");

  const contactIdRaw = (input.contact_id ?? "").trim();
  const contactId = contactIdRaw && UUID_RE.test(contactIdRaw) ? contactIdRaw : null;

  const activityIdRaw = (input.activity_id ?? "").trim();
  const activityId = activityIdRaw && UUID_RE.test(activityIdRaw) ? activityIdRaw : null;

  if (activityId) {
    const { data: act } = await supabaseAdmin
      .from("facility_activities")
      .select("id, facility_id")
      .eq("id", activityId)
      .maybeSingle();
    if (!act?.id || String(act.facility_id) !== facilityId) {
      return { ok: false, error: "activity_not_found" };
    }
  }

  const firstName = (input.patient_first_name ?? "").trim();
  const lastName = (input.patient_last_name ?? "").trim();
  const patientName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Referral prospect";
  const primaryPhone = normalizePhone(input.patient_phone ?? "");
  const dob = (input.patient_dob ?? "").trim().slice(0, 10) || null;

  if (!input.force_create) {
    const duplicates = await findFacilityReferralDuplicateLeads({
      phoneE164: primaryPhone || null,
      patientFirstName: firstName || null,
      patientLastName: lastName || null,
      dobIso: dob,
      facilityId,
    });
    if (duplicates.length > 0) {
      return {
        ok: false,
        error: "duplicate_found",
        duplicate_check: true,
        possible_duplicates: duplicates,
      };
    }
  }

  const salesRepRaw = (input.sales_rep_id ?? "").trim();
  const salesRepId =
    salesRepRaw && UUID_RE.test(salesRepRaw)
      ? salesRepRaw
      : ((facility as { assigned_rep_user_id?: string | null }).assigned_rep_user_id ?? staff.user_id);

  let activityMeta: {
    activity_type?: string | null;
    outcome?: string | null;
    route_stop_id?: string | null;
  } = {};

  if (activityId) {
    const { data: actRow } = await supabaseAdmin
      .from("facility_activities")
      .select("activity_type, outcome, route_stop_id")
      .eq("id", activityId)
      .maybeSingle();
    if (actRow) {
      activityMeta = {
        activity_type: actRow.activity_type as string | null,
        outcome: actRow.outcome as string | null,
        route_stop_id: (actRow as { route_stop_id?: string | null }).route_stop_id ?? null,
      };
    }
  }

  const attribution = {
    source_type: input.attribution?.source_type ?? "facility_outreach",
    source_name: input.attribution?.source_name ?? facilityName,
    facility_id: facilityId,
    facility_name: facilityName,
    contact_id: contactId,
    activity_id: activityId,
    sales_rep_id: salesRepId,
    originating_activity_type: input.attribution?.originating_activity_type ?? activityMeta.activity_type ?? null,
    originating_outcome: input.attribution?.originating_outcome ?? activityMeta.outcome ?? null,
    originating_route_stop_id: activityMeta.route_stop_id ?? null,
    created_by_user_id: staff.user_id,
  };

  const disciplines = parseServiceDisciplines(input.service_needed);
  const statusRaw = (input.status ?? "new").trim();
  const status = isValidLeadPipelineStatus(statusRaw) ? statusRaw : "new";
  const referralReceivedAt = referralDateIso(input.referral_date);
  const payer = (input.payer ?? "").trim() || null;
  const notes = (input.notes ?? "").trim() || null;

  const { data: contactRow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .insert({
      full_name: patientName,
      primary_phone: primaryPhone || null,
    })
    .select("id")
    .single();

  if (cErr || !contactRow?.id) {
    console.warn("[facility-referral-lead] contact insert:", cErr?.message);
    return { ok: false, error: "contact_failed" };
  }

  const contactIdInserted = contactRow.id as string;

  const { data: leadRow, error: lErr } = await supabaseAdmin
    .from("leads")
    .insert({
      contact_id: contactIdInserted,
      source: "facility_outreach",
      status,
      owner_user_id: salesRepId,
      produced_by_user_id: salesRepId,
      consent_to_contact: true,
      dob,
      referring_facility_id: facilityId,
      referring_facility_contact_id: contactId,
      referring_facility_activity_id: activityId,
      referral_source_type: attribution.source_type,
      referral_source: facilityName,
      referral_received_at: referralReceivedAt,
      referral_attribution_json: attribution,
      doctor_office_name: facilityName,
      primary_payer_name: payer,
      payer_name: payer,
      service_disciplines: disciplines,
      service_type: disciplines.length > 0 ? disciplines.join(", ") : null,
      notes,
    })
    .select("id, status")
    .single();

  if (lErr || !leadRow?.id) {
    console.warn("[facility-referral-lead] lead insert:", lErr?.message);
    await supabaseAdmin.from("contacts").delete().eq("id", contactIdInserted);
    return { ok: false, error: "lead_failed" };
  }

  const leadId = leadRow.id as string;

  await handleNewLeadCreated(supabaseAdmin, {
    leadId,
    contactId: contactIdInserted,
    intakeChannel: "other",
  });

  if (activityId) {
    const { error: actErr } = await supabaseAdmin
      .from("facility_activities")
      .update({
        linked_lead_id: leadId,
        referral_created: true,
      })
      .eq("id", activityId);

    if (actErr) {
      console.warn("[facility-referral-lead] activity link:", actErr.message);
    }
  }

  await supabaseAdmin
    .from("facilities")
    .update({ last_referral_at: referralReceivedAt })
    .eq("id", facilityId);

  const intakeOwnerId = resolveIntakeOwnerUserId(staff, {
    assigned_to_staff_id: null,
    owner_user_id: salesRepId,
  });

  await bootstrapFacilityReferralIntake(supabaseAdmin, {
    leadId,
    facilityId,
    facilityName,
    facilityContactId: contactId,
    salesRepId,
    createdBy: staff.user_id,
    intakeOwnerId,
  });

  let followUpTaskId: string | null = null;
  if (input.create_follow_up_task !== false) {
    followUpTaskId = await insertReferralFollowUpTask(supabaseAdmin, {
      facilityId,
      contactId,
      assignedTo: salesRepId,
      facilityName,
      createdBy: staff.user_id,
    });
  }

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

  return {
    ok: true,
    lead: { id: leadId, status: typeof leadRow.status === "string" ? leadRow.status : null },
    facility: { id: facilityId, name: facilityName },
    activity: activityId ? { id: activityId } : null,
    follow_up_task_id: followUpTaskId,
  };
}

async function insertReferralFollowUpTask(
  supabase: SupabaseClient,
  input: {
    facilityId: string;
    contactId: string | null;
    assignedTo: string;
    facilityName: string;
    createdBy: string;
  }
): Promise<string | null> {
  const dueDate = new Date(`${getCrmCalendarTomorrowIso()}T17:00:00`);
  const { data, error } = await supabase
    .from("facility_follow_up_tasks")
    .insert({
      facility_id: input.facilityId,
      contact_id: input.contactId,
      assigned_to: input.assignedTo,
      title: `Follow up on referral from ${input.facilityName}`,
      description: "Confirm referral status and next steps.",
      due_at: dueDate.toISOString(),
      status: "open",
      priority: "Normal",
      source: "facility_referral",
      created_by: input.createdBy,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.warn("[facility-referral-lead] follow-up task:", error?.message);
    return null;
  }
  return String(data.id);
}

export async function loadFacilityReferralAttribution(
  facilityId: string,
  staffById: Map<string, { full_name: string | null; email: string | null }>
): Promise<FacilityReferralAttributionSummary> {
  const empty: FacilityReferralAttributionSummary = {
    total_leads: 0,
    open_referrals: 0,
    converted: 0,
    lost: 0,
    last_referral_at: null,
    top_contact_name: null,
    top_rep_label: null,
    pending_intake_tasks: 0,
    next_source_follow_up: null,
    last_referral_outcome: null,
    recent_leads: [],
  };

  if (!UUID_RE.test(facilityId)) return empty;

  const { data: leads, error } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, status, created_at, updated_at, referral_received_at, produced_by_user_id, referring_facility_contact_id, assigned_to_staff_id, referral_attribution_json, service_type, primary_payer_name, payer_name, contacts ( full_name ), facility_contacts:referring_facility_contact_id ( full_name, first_name, last_name )"
      )
      .eq("referring_facility_id", facilityId)
      .order("created_at", { ascending: false })
      .limit(100)
  );

  if (error) {
    console.warn("[facility-referral-lead] attribution load:", error.message);
    return empty;
  }

  const rows = leads ?? [];
  let open = 0;
  let converted = 0;
  let lost = 0;
  let lastReferral: string | null = null;

  const contactCounts = new Map<string, { name: string; count: number }>();
  const repCounts = new Map<string, number>();

  for (const row of rows) {
    const st = typeof row.status === "string" ? row.status.toLowerCase() : "";
    if (st === "converted") converted++;
    else if (st === "dead_lead") lost++;
    else open++;

    const refAt =
      (typeof row.referral_received_at === "string" ? row.referral_received_at : null) ??
      (typeof row.created_at === "string" ? row.created_at : null);
    if (refAt && (!lastReferral || refAt > lastReferral)) lastReferral = refAt;

    const fc = row.facility_contacts as
      | { full_name?: string; first_name?: string; last_name?: string }
      | { full_name?: string; first_name?: string; last_name?: string }[]
      | null;
    const contact = Array.isArray(fc) ? fc[0] : fc;
    const contactName =
      (contact?.full_name ?? "").trim() ||
      [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();
    const contactKey = typeof row.referring_facility_contact_id === "string" ? row.referring_facility_contact_id : "";
    if (contactKey && contactName) {
      const prev = contactCounts.get(contactKey);
      contactCounts.set(contactKey, { name: contactName, count: (prev?.count ?? 0) + 1 });
    }

    const repId = typeof row.produced_by_user_id === "string" ? row.produced_by_user_id : "";
    if (repId) repCounts.set(repId, (repCounts.get(repId) ?? 0) + 1);
  }

  let topContactName: string | null = null;
  let topContactCount = 0;
  for (const { name, count } of contactCounts.values()) {
    if (count > topContactCount) {
      topContactCount = count;
      topContactName = name;
    }
  }

  let topRepLabel: string | null = null;
  let topRepCount = 0;
  for (const [repId, count] of repCounts) {
    if (count > topRepCount) {
      topRepCount = count;
      topRepLabel = staffLabelFromLookup(repId, staffById);
    }
  }

  const leadIds = rows.map((r) => String(r.id));
  const readinessByLead = await loadIntakeReadinessByLeadIds(leadIds);
  let referralsNeedingInfo = 0;
  for (const r of readinessByLead.values()) {
    if (r.readiness_status === "needs_info") referralsNeedingInfo++;
  }

  const recent_leads = rows.slice(0, 10).map((row) => {
    const cr = row.contacts as { full_name?: string } | { full_name?: string }[] | null;
    const c = Array.isArray(cr) ? cr[0] : cr;
    const repId = typeof row.produced_by_user_id === "string" ? row.produced_by_user_id : null;
    const intakeId =
      typeof row.assigned_to_staff_id === "string" ? row.assigned_to_staff_id : null;
    const status = typeof row.status === "string" ? row.status : "new";
    const createdAt = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
    const leadId = String(row.id);
    const readiness = readinessByLead.get(leadId);
    return {
      lead_id: leadId,
      patient_name: (c?.full_name ?? "").trim() || "Prospect",
      status,
      pipeline_stage_label: pipelineStageForLeadStatus(status).label,
      service_type: typeof row.service_type === "string" ? row.service_type : null,
      payer_name:
        (typeof row.primary_payer_name === "string" ? row.primary_payer_name : null) ??
        (typeof row.payer_name === "string" ? row.payer_name : null),
      created_at: createdAt,
      updated_at: typeof row.updated_at === "string" ? row.updated_at : createdAt,
      created_by_label: staffLabelFromLookup(repId, staffById),
      intake_owner_label: staffLabelFromLookup(intakeId, staffById),
      readiness_status: readiness?.readiness_status ?? null,
      readiness_score: readiness?.readiness_score ?? null,
      readiness_missing_count: readiness?.missing_item_count ?? 0,
    };
  });

  let pendingIntakeTasks = 0;
  if (leadIds.length > 0) {
    const { count } = await supabaseAdmin
      .from("crm_tasks")
      .select("id", { count: "exact", head: true })
      .eq("related_entity_type", "lead")
      .in("related_entity_id", leadIds)
      .in("status", ["open", "in_progress", "blocked"]);
    pendingIntakeTasks = count ?? 0;
  }

  const { data: nextFollowUp } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .select("title, due_at")
    .eq("facility_id", facilityId)
    .eq("source", "facility_referral")
    .in("status", ["open", "snoozed"])
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let lastReferralOutcome: string | null = null;
  for (const row of rows) {
    const st = typeof row.status === "string" ? row.status : "new";
    const stage = pipelineStageForLeadStatus(st);
    if (stage.key === "converted" || stage.key === "lost") {
      const meta = row.referral_attribution_json as Record<string, unknown> | null;
      const lostReason =
        typeof meta?.lost_reason === "string" && meta.lost_reason.trim() ? meta.lost_reason.trim() : null;
      lastReferralOutcome = lostReason ? `${stage.label}: ${lostReason}` : stage.label;
      break;
    }
  }

  return {
    total_leads: rows.length,
    open_referrals: open,
    converted,
    lost,
    last_referral_at: lastReferral,
    top_contact_name: topContactName,
    top_rep_label: topRepLabel,
    pending_intake_tasks: pendingIntakeTasks,
    next_source_follow_up:
      nextFollowUp?.due_at && typeof nextFollowUp.title === "string"
        ? { title: nextFollowUp.title, due_at: String(nextFollowUp.due_at) }
        : null,
    last_referral_outcome: lastReferralOutcome,
    referrals_needing_info: referralsNeedingInfo,
    recent_leads,
  };
}

export type ReferralAnalyticsAgg = {
  leadsCreated: number;
  converted: number;
  conversionRate: number | null;
  byFacility: Array<{
    facilityId: string;
    facilityName: string;
    facilityType: string | null;
    city: string | null;
    leads: number;
    converted: number;
    conversionRate: number | null;
    lastReferralAt: string | null;
    assignedRepLabel: string | null;
  }>;
  byRep: Array<{ repUserId: string; repLabel: string; leads: number; converted: number }>;
  byContact: Array<{ contactName: string; leads: number; converted: number }>;
  byService: Array<{ label: string; count: number }>;
  byPayer: Array<{ label: string; count: number }>;
};

export async function aggregateReferralAttributionForAnalytics(input: {
  startIso: string;
  endIso: string;
  repId?: string | null;
  staffById: Map<string, { full_name: string | null; email: string | null }>;
  facilityById: Record<
    string,
    { name: string; type: string | null; city: string | null; assigned_rep_user_id: string | null }
  >;
}): Promise<ReferralAnalyticsAgg> {
  let query = leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, status, created_at, referral_received_at, referring_facility_id, produced_by_user_id, service_type, service_disciplines, primary_payer_name, payer_name, referring_facility_contact_id, facility_contacts:referring_facility_contact_id ( full_name, first_name, last_name )"
      )
      .not("referring_facility_id", "is", null)
      .gte("created_at", input.startIso)
      .lte("created_at", input.endIso)
  );

  if (input.repId) {
    query = query.eq("produced_by_user_id", input.repId);
  }

  const { data: leads } = await query.limit(5000);
  const rows = leads ?? [];

  let converted = 0;
  const facilityMap = new Map<
    string,
    { leads: number; converted: number; lastReferralAt: string | null }
  >();
  const repMap = new Map<string, { leads: number; converted: number }>();
  const contactMap = new Map<string, { leads: number; converted: number }>();
  const serviceMap = new Map<string, number>();
  const payerMap = new Map<string, number>();

  for (const row of rows) {
    const st = typeof row.status === "string" ? row.status.toLowerCase() : "";
    const isConverted = st === "converted";
    if (isConverted) converted++;

    const fid = typeof row.referring_facility_id === "string" ? row.referring_facility_id : "";
    const refAt =
      (typeof row.referral_received_at === "string" ? row.referral_received_at : null) ??
      (typeof row.created_at === "string" ? row.created_at : null);

    if (fid) {
      const prev = facilityMap.get(fid) ?? { leads: 0, converted: 0, lastReferralAt: null };
      prev.leads++;
      if (isConverted) prev.converted++;
      if (refAt && (!prev.lastReferralAt || refAt > prev.lastReferralAt)) prev.lastReferralAt = refAt;
      facilityMap.set(fid, prev);
    }

    const repId = typeof row.produced_by_user_id === "string" ? row.produced_by_user_id : "";
    if (repId) {
      const prev = repMap.get(repId) ?? { leads: 0, converted: 0 };
      prev.leads++;
      if (isConverted) prev.converted++;
      repMap.set(repId, prev);
    }

    const fc = row.facility_contacts as
      | { full_name?: string; first_name?: string; last_name?: string }
      | { full_name?: string; first_name?: string; last_name?: string }[]
      | null;
    const contact = Array.isArray(fc) ? fc[0] : fc;
    const contactName =
      (contact?.full_name ?? "").trim() ||
      [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() ||
      "Unknown contact";
    const cPrev = contactMap.get(contactName) ?? { leads: 0, converted: 0 };
    cPrev.leads++;
    if (isConverted) cPrev.converted++;
    contactMap.set(contactName, cPrev);

    const discs = Array.isArray(row.service_disciplines) ? row.service_disciplines : [];
    if (discs.length > 0) {
      for (const d of discs) {
        if (typeof d === "string") serviceMap.set(d, (serviceMap.get(d) ?? 0) + 1);
      }
    } else if (typeof row.service_type === "string" && row.service_type.trim()) {
      serviceMap.set(row.service_type.trim(), (serviceMap.get(row.service_type.trim()) ?? 0) + 1);
    }

    const payer =
      (typeof row.primary_payer_name === "string" ? row.primary_payer_name : null) ??
      (typeof row.payer_name === "string" ? row.payer_name : null) ??
      "Unknown";
    payerMap.set(payer, (payerMap.get(payer) ?? 0) + 1);
  }

  const leadsCreated = rows.length;

  const byFacility = [...facilityMap.entries()]
    .map(([facilityId, stats]) => {
      const f = input.facilityById[facilityId];
      return {
        facilityId,
        facilityName: f?.name ?? "Facility",
        facilityType: f?.type ?? null,
        city: f?.city ?? null,
        leads: stats.leads,
        converted: stats.converted,
        conversionRate: stats.leads > 0 ? Math.round((stats.converted / stats.leads) * 100) : null,
        lastReferralAt: stats.lastReferralAt,
        assignedRepLabel: staffLabelFromLookup(f?.assigned_rep_user_id ?? null, input.staffById),
      };
    })
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 25);

  const byRep = [...repMap.entries()]
    .map(([repUserId, stats]) => ({
      repUserId,
      repLabel: staffLabelFromLookup(repUserId, input.staffById) ?? "Unknown",
      leads: stats.leads,
      converted: stats.converted,
    }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 15);

  const byContact = [...contactMap.entries()]
    .map(([contactName, stats]) => ({ contactName, leads: stats.leads, converted: stats.converted }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 15);

  const byService = [...serviceMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const byPayer = [...payerMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    leadsCreated,
    converted,
    conversionRate: leadsCreated > 0 ? Math.round((converted / leadsCreated) * 100) : null,
    byFacility,
    byRep,
    byContact,
    byService,
    byPayer,
  };
}

export async function aggregatePrintedQrReferralStats(input: {
  startIso: string;
  endIso: string;
}): Promise<{
  total: number;
  matched: number;
  unmatched: number;
}> {
  const { data: rows } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("id, referral_source_type, referring_facility_id, needs_referral_source_review")
      .in("referral_source_type", ["printed_qr", "unmatched_printed_qr"])
      .gte("created_at", input.startIso)
      .lte("created_at", input.endIso)
      .limit(5000)
  );

  let matched = 0;
  let unmatched = 0;
  for (const row of rows ?? []) {
    const refType = typeof row.referral_source_type === "string" ? row.referral_source_type : "";
    if (refType === "unmatched_printed_qr" || row.needs_referral_source_review) {
      unmatched++;
    } else {
      matched++;
    }
  }

  return { total: (rows ?? []).length, matched, unmatched };
}

export async function loadFacilityReferralCountsByFacility(
  facilityIds: string[]
): Promise<Map<string, { total: number; converted: number; lastReferralAt: string | null }>> {
  const out = new Map<string, { total: number; converted: number; lastReferralAt: string | null }>();
  if (facilityIds.length === 0) return out;

  const { data: leads } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("referring_facility_id, status, referral_received_at, created_at")
      .in("referring_facility_id", facilityIds)
      .limit(5000)
  );

  for (const row of leads ?? []) {
    const fid = typeof row.referring_facility_id === "string" ? row.referring_facility_id : "";
    if (!fid) continue;
    const prev = out.get(fid) ?? { total: 0, converted: 0, lastReferralAt: null };
    prev.total++;
    if (typeof row.status === "string" && row.status.toLowerCase() === "converted") prev.converted++;
    const refAt =
      (typeof row.referral_received_at === "string" ? row.referral_received_at : null) ??
      (typeof row.created_at === "string" ? row.created_at : null);
    if (refAt && (!prev.lastReferralAt || refAt > prev.lastReferralAt)) prev.lastReferralAt = refAt;
    out.set(fid, prev);
  }

  return out;
}
