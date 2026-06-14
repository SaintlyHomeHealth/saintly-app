import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/admin";
import { appendLeadActivityRow } from "@/lib/crm/append-lead-activity";
import { getCrmCalendarTomorrowIso } from "@/lib/crm/crm-local-date";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import type { FacilityReferralChecklistRow } from "@/lib/crm/facility-referral-pipeline-types";
import { canRoleBeIntakeOwner } from "@/lib/crm/facility-referral-pipeline-utils";
import type { StaffProfile } from "@/lib/staff-profile";
import { isManagerOrHigher } from "@/lib/staff-profile";
import {
  notifyFacilityReferralConverted,
  notifyFacilityReferralLost,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}

function mapChecklistRow(raw: Record<string, unknown>): FacilityReferralChecklistRow {
  return {
    id: String(raw.id),
    lead_id: String(raw.lead_id),
    referring_facility_id:
      typeof raw.referring_facility_id === "string" ? raw.referring_facility_id : null,
    patient_contacted: Boolean(raw.patient_contacted),
    insurance_verified: Boolean(raw.insurance_verified),
    service_need_confirmed: Boolean(raw.service_need_confirmed),
    orders_requested: Boolean(raw.orders_requested),
    f2f_requested: Boolean(raw.f2f_requested),
    packet_received: Boolean(raw.packet_received),
    soc_availability_checked: Boolean(raw.soc_availability_checked),
    clinician_scheduling_started: Boolean(raw.clinician_scheduling_started),
    referral_source_updated: Boolean(raw.referral_source_updated),
    converted_or_closed: Boolean(raw.converted_or_closed),
    checklist_json:
      raw.checklist_json && typeof raw.checklist_json === "object" && !Array.isArray(raw.checklist_json)
        ? (raw.checklist_json as Record<string, unknown>)
        : null,
    updated_by: typeof raw.updated_by === "string" ? raw.updated_by : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

export function resolveIntakeOwnerUserId(
  staff: StaffProfile,
  lead: {
    assigned_to_staff_id?: string | null;
    owner_user_id?: string | null;
  }
): string | null {
  const assigned = (lead.assigned_to_staff_id ?? "").trim();
  if (assigned && UUID_RE.test(assigned)) return assigned;

  if (canRoleBeIntakeOwner(staff.role)) return staff.user_id;
  return null;
}

export async function getReferralChecklistForLead(leadId: string): Promise<FacilityReferralChecklistRow | null> {
  const { data } = await supabaseAdmin
    .from("facility_referral_intake_checklists")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!data) return null;
  return mapChecklistRow(data as Record<string, unknown>);
}

export async function ensureReferralChecklist(
  supabase: SupabaseClient,
  input: { leadId: string; facilityId: string | null; updatedBy?: string | null }
): Promise<FacilityReferralChecklistRow | null> {
  const existing = await getReferralChecklistForLead(input.leadId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("facility_referral_intake_checklists")
    .insert({
      lead_id: input.leadId,
      referring_facility_id: input.facilityId,
      updated_by: input.updatedBy ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.warn("[facility-referral-intake] checklist create:", error?.message);
    return null;
  }
  return mapChecklistRow(data as Record<string, unknown>);
}

async function crmTaskExists(
  supabase: SupabaseClient,
  leadId: string,
  titleNeedle: string
): Promise<boolean> {
  const { data } = await supabase
    .from("crm_tasks")
    .select("id, title")
    .eq("related_entity_type", "lead")
    .eq("related_entity_id", leadId)
    .in("status", ["open", "in_progress", "blocked"])
    .limit(20);

  const needle = titleNeedle.toLowerCase();
  return (data ?? []).some((r) => String((r as { title?: string }).title ?? "").toLowerCase().includes(needle));
}

async function insertCrmIntakeTask(
  supabase: SupabaseClient,
  input: {
    leadId: string;
    title: string;
    description?: string;
    dueAt: string;
    assignedTo: string | null;
    createdBy: string;
  }
): Promise<string | null> {
  if (await crmTaskExists(supabase, input.leadId, input.title)) return null;

  const { data, error } = await supabase
    .from("crm_tasks")
    .insert({
      title: input.title,
      description: input.description ?? null,
      status: "open",
      priority: "high",
      due_at: input.dueAt,
      related_entity_type: "lead",
      related_entity_id: input.leadId,
      assigned_to: input.assignedTo,
      created_by: input.createdBy,
      source: "manual",
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.warn("[facility-referral-intake] crm task:", error?.message);
    return null;
  }
  return String(data.id);
}

async function facilitySourceTaskExists(
  supabase: SupabaseClient,
  facilityId: string,
  titleNeedle: string
): Promise<boolean> {
  const { data } = await supabase
    .from("facility_follow_up_tasks")
    .select("id, title")
    .eq("facility_id", facilityId)
    .eq("status", "open")
    .limit(20);
  const needle = titleNeedle.toLowerCase();
  return (data ?? []).some((r) => String((r as { title?: string }).title ?? "").toLowerCase().includes(needle));
}

export async function bootstrapFacilityReferralIntake(
  supabase: SupabaseClient,
  input: {
    leadId: string;
    facilityId: string;
    facilityName: string;
    facilityContactId?: string | null;
    salesRepId: string;
    createdBy: string;
    intakeOwnerId: string | null;
  }
): Promise<void> {
  await ensureReferralChecklist(supabase, {
    leadId: input.leadId,
    facilityId: input.facilityId,
    updatedBy: input.createdBy,
  });

  const dueToday = endOfTodayIso();
  const dueTomorrow = new Date(`${getCrmCalendarTomorrowIso()}T17:00:00`).toISOString();
  const owner = input.intakeOwnerId;

  await insertCrmIntakeTask(supabase, {
    leadId: input.leadId,
    title: "Contact patient — facility referral",
    description: `Initial outreach for referral from ${input.facilityName}.`,
    dueAt: dueToday,
    assignedTo: owner,
    createdBy: input.createdBy,
  });

  await insertCrmIntakeTask(supabase, {
    leadId: input.leadId,
    title: "Verify insurance — facility referral",
    description: "Confirm payer eligibility for facility-sourced referral.",
    dueAt: dueToday,
    assignedTo: owner,
    createdBy: input.createdBy,
  });

  await insertCrmIntakeTask(supabase, {
    leadId: input.leadId,
    title: "Request orders / F2F if missing",
    description: "Confirm physician orders or face-to-face documentation.",
    dueAt: dueTomorrow,
    assignedTo: owner,
    createdBy: input.createdBy,
  });

  const sourceTitle = "Follow up with referral source";
  if (!(await facilitySourceTaskExists(supabase, input.facilityId, sourceTitle))) {
    await supabase.from("facility_follow_up_tasks").insert({
      facility_id: input.facilityId,
      contact_id: input.facilityContactId ?? null,
      assigned_to: input.salesRepId,
      title: `${sourceTitle} — ${input.facilityName}`,
      description: "Confirm referral received and next steps with the facility.",
      due_at: dueTomorrow,
      status: "open",
      priority: "Normal",
      source: "facility_referral",
      created_by: input.createdBy,
    });
  }

  if (owner) {
    await supabase
      .from("leads")
      .update({ assigned_to_staff_id: owner })
      .eq("id", input.leadId)
      .is("deleted_at", null);
  }
}

export type UpdateReferralChecklistInput = Partial<{
  patient_contacted: boolean;
  insurance_verified: boolean;
  service_need_confirmed: boolean;
  orders_requested: boolean;
  f2f_requested: boolean;
  packet_received: boolean;
  soc_availability_checked: boolean;
  clinician_scheduling_started: boolean;
  referral_source_updated: boolean;
  converted_or_closed: boolean;
}>;

export async function updateReferralChecklist(
  staff: StaffProfile,
  leadId: string,
  patch: UpdateReferralChecklistInput
): Promise<{ ok: true; checklist: FacilityReferralChecklistRow } | { ok: false; error: string }> {
  if (!isManagerOrHigher(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, referring_facility_id")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead?.id) return { ok: false, error: "lead_not_found" };

  await ensureReferralChecklist(supabaseAdmin, {
    leadId,
    facilityId: typeof lead.referring_facility_id === "string" ? lead.referring_facility_id : null,
    updatedBy: staff.user_id,
  });

  const { data, error } = await supabaseAdmin
    .from("facility_referral_intake_checklists")
    .update({
      ...patch,
      updated_by: staff.user_id,
      updated_at: new Date().toISOString(),
    })
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.warn("[facility-referral-intake] checklist update:", error?.message);
    return { ok: false, error: "update_failed" };
  }

  return { ok: true, checklist: mapChecklistRow(data as Record<string, unknown>) };
}

export async function assignReferralIntakeOwner(
  staff: StaffProfile,
  leadId: string,
  intakeOwnerId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isManagerOrHigher(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  const owner = intakeOwnerId?.trim() && UUID_RE.test(intakeOwnerId.trim()) ? intakeOwnerId.trim() : null;

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ assigned_to_staff_id: owner })
    .eq("id", leadId)
    .is("deleted_at", null);

  if (error) {
    console.warn("[facility-referral-intake] assign:", error.message);
    return { ok: false, error: "assign_failed" };
  }

  const { data: ownerStaff } = owner
    ? await supabaseAdmin.from("staff_profiles").select("full_name, email").eq("user_id", owner).maybeSingle()
    : { data: null };

  await appendLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.owner_changed,
    body: owner
      ? `Facility referral intake assigned to ${staffLabelFromLookup(owner, ownerStaff ? { [owner]: ownerStaff } : {}) ?? "staff"}.`
      : "Facility referral intake owner cleared.",
    metadata: { intake_owner_id: owner, facility_referral: true },
    createdByUserId: staff.user_id,
  });

  return { ok: true };
}

export async function createSourceFollowUpTask(
  supabase: SupabaseClient,
  input: {
    facilityId: string;
    facilityName: string;
    contactId?: string | null;
    salesRepId: string;
    title: string;
    description?: string;
    createdBy: string;
    dueAt?: string;
  }
): Promise<string | null> {
  if (await facilitySourceTaskExists(supabase, input.facilityId, input.title)) return null;

  const due = input.dueAt ?? new Date(`${getCrmCalendarTomorrowIso()}T17:00:00`).toISOString();
  const { data, error } = await supabase
    .from("facility_follow_up_tasks")
    .insert({
      facility_id: input.facilityId,
      contact_id: input.contactId ?? null,
      assigned_to: input.salesRepId,
      title: input.title,
      description: input.description ?? null,
      due_at: due,
      status: "open",
      priority: "Normal",
      source: "facility_referral",
      created_by: input.createdBy,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.warn("[facility-referral-intake] source task:", error?.message);
    return null;
  }
  return String(data.id);
}

export async function updateFacilityReferralStatus(
  staff: StaffProfile,
  leadId: string,
  input: {
    status: string;
    note?: string;
    lost_reason?: string | null;
    create_source_follow_up?: boolean;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isManagerOrHigher(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select(
      "id, status, contact_id, referring_facility_id, referring_facility_contact_id, produced_by_user_id, referral_attribution_json, referral_received_at"
    )
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead?.id) return { ok: false, error: "lead_not_found" };

  const newStatus = input.status.trim();
  if (!newStatus) return { ok: false, error: "invalid_status" };

  const isLost = newStatus === "dead_lead";
  if (isLost && !(input.lost_reason ?? "").trim()) {
    return { ok: false, error: "lost_reason_required" };
  }

  const prevStatus = typeof lead.status === "string" ? lead.status : "";
  const meta =
    lead.referral_attribution_json && typeof lead.referral_attribution_json === "object"
      ? { ...(lead.referral_attribution_json as Record<string, unknown>) }
      : {};

  if (isLost && input.lost_reason) {
    meta.lost_reason = input.lost_reason.trim();
    meta.lost_at = new Date().toISOString();
  }
  if (newStatus === "converted") {
    meta.converted_at = new Date().toISOString();
  }

  const { error: uErr } = await supabaseAdmin
    .from("leads")
    .update({
      status: newStatus,
      referral_attribution_json: meta,
    })
    .eq("id", leadId)
    .is("deleted_at", null);

  if (uErr) {
    console.warn("[facility-referral-intake] status update:", uErr.message);
    return { ok: false, error: "update_failed" };
  }

  const note = (input.note ?? "").trim();
  await appendLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.status_changed,
    body: note || `Referral status: ${prevStatus || "—"} → ${newStatus}`,
    metadata: {
      from_status: prevStatus,
      to_status: newStatus,
      lost_reason: input.lost_reason ?? null,
      facility_referral: true,
    },
    createdByUserId: staff.user_id,
  });

  const facilityId = typeof lead.referring_facility_id === "string" ? lead.referring_facility_id : null;
  const checklistPatch: UpdateReferralChecklistInput = {};
  if (newStatus === "converted" || isLost) checklistPatch.converted_or_closed = true;
  if (newStatus === "attempted_contact" || newStatus === "spoke") checklistPatch.patient_contacted = true;
  if (newStatus === "verify_insurance") checklistPatch.insurance_verified = true;
  if (newStatus === "waiting_on_referral") {
    checklistPatch.orders_requested = true;
    checklistPatch.f2f_requested = true;
  }
  if (Object.keys(checklistPatch).length > 0) {
    await updateReferralChecklist(staff, leadId, checklistPatch);
  }

  if (facilityId && input.create_source_follow_up !== false) {
    const { data: facility } = await supabaseAdmin.from("facilities").select("name").eq("id", facilityId).maybeSingle();
    const facilityName = String(facility?.name ?? "Facility");
    const repId =
      typeof lead.produced_by_user_id === "string" && lead.produced_by_user_id
        ? lead.produced_by_user_id
        : staff.user_id;

    if (newStatus === "converted") {
      await createSourceFollowUpTask(supabaseAdmin, {
        facilityId,
        facilityName,
        contactId:
          typeof lead.referring_facility_contact_id === "string" ? lead.referring_facility_contact_id : null,
        salesRepId: repId,
        title: `Thank ${facilityName} for referral / confirm SOC`,
        description: note || "Referral converted — update the referral source.",
        createdBy: staff.user_id,
      });
      await supabaseAdmin.from("facilities").update({ last_referral_at: new Date().toISOString() }).eq("id", facilityId);
    } else if (isLost && input.lost_reason) {
      await createSourceFollowUpTask(supabaseAdmin, {
        facilityId,
        facilityName,
        contactId:
          typeof lead.referring_facility_contact_id === "string" ? lead.referring_facility_contact_id : null,
        salesRepId: repId,
        title: `Update ${facilityName} on referral outcome`,
        description: `Lost reason: ${input.lost_reason}. ${note}`.trim(),
        createdBy: staff.user_id,
      });
    }
  }

  const facilityIdForNotify = typeof lead.referring_facility_id === "string" ? lead.referring_facility_id : null;
  if (facilityIdForNotify && (newStatus === "converted" || isLost)) {
    const { data: facilityRow } = await supabaseAdmin
      .from("facilities")
      .select("name")
      .eq("id", facilityIdForNotify)
      .maybeSingle();
    const facilityName = String(facilityRow?.name ?? "Facility");
    let patientName = "Patient";
    const contactId = typeof lead.contact_id === "string" ? lead.contact_id : null;
    if (contactId) {
      const { data: contactRow } = await supabaseAdmin
        .from("contacts")
        .select("full_name")
        .eq("id", contactId)
        .maybeSingle();
      patientName = String((contactRow as { full_name?: string } | null)?.full_name ?? "Patient");
    }
    const salesRepId =
      typeof lead.produced_by_user_id === "string" && lead.produced_by_user_id
        ? lead.produced_by_user_id
        : null;

    if (newStatus === "converted") {
      queueFacilityNotification(() =>
        notifyFacilityReferralConverted({
          leadId,
          facilityId: facilityIdForNotify,
          facilityName,
          patientName,
          salesRepUserId: salesRepId,
        })
      );
    } else if (isLost && input.lost_reason) {
      queueFacilityNotification(() =>
        notifyFacilityReferralLost({
          leadId,
          facilityId: facilityIdForNotify,
          facilityName,
          patientName,
          lostReason: input.lost_reason!.trim(),
          salesRepUserId: salesRepId,
        })
      );
    }
  }

  return { ok: true };
}
