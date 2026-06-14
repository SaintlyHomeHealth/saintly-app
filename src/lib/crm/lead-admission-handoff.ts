import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { appendLeadActivityRow } from "@/lib/crm/append-lead-activity";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import {
  DEFAULT_ADMISSION_CHECKLIST_ITEMS,
  type AdmissionHandoffAnalytics,
  type AdmissionHandoffDetail,
  type AdmissionHandoffListCard,
  type AdmissionHandoffListFilters,
  type AdmissionHandoffStatus,
  type LeadAdmissionChecklistItemRow,
  type LeadAdmissionHandoffRow,
  type UpdateAdmissionChecklistItemInput,
  type UpdateAdmissionHandoffInput,
} from "@/lib/crm/lead-admission-handoff-types";
import { buildLeadDocumentIntakeSummary } from "@/lib/crm/lead-referral-document-ai";
import { loadReferralDocumentSummariesByLeadIds } from "@/lib/crm/lead-referral-documents";
import {
  notifyLeadAdmissionAdmitted,
  notifyLeadAdmissionAloraEntered,
  notifyLeadAdmissionHandoffCreated,
  notifyLeadAdmissionOnHold,
  notifyLeadAdmissionReadyForSoc,
  notifyLeadAdmissionSocScheduled,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import type { StaffProfile } from "@/lib/staff-profile";
import { isCrmLeadsRowPolicyRole, isSalesAgentRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapHandoffRow(raw: Record<string, unknown>): LeadAdmissionHandoffRow {
  const arr = (v: unknown): string[] | null =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : null;
  return {
    id: String(raw.id),
    lead_id: String(raw.lead_id),
    patient_id: typeof raw.patient_id === "string" ? raw.patient_id : null,
    referring_facility_id: typeof raw.referring_facility_id === "string" ? raw.referring_facility_id : null,
    referring_facility_contact_id:
      typeof raw.referring_facility_contact_id === "string" ? raw.referring_facility_contact_id : null,
    source_link_id: typeof raw.source_link_id === "string" ? raw.source_link_id : null,
    intake_readiness_review_id:
      typeof raw.intake_readiness_review_id === "string" ? raw.intake_readiness_review_id : null,
    status: String(raw.status ?? "draft") as LeadAdmissionHandoffRow["status"],
    admission_priority: (String(raw.admission_priority ?? "Normal") as LeadAdmissionHandoffRow["admission_priority"]),
    primary_discipline: typeof raw.primary_discipline === "string" ? raw.primary_discipline : null,
    requested_services: arr(raw.requested_services),
    payer_name: typeof raw.payer_name === "string" ? raw.payer_name : null,
    payer_status: typeof raw.payer_status === "string" ? (raw.payer_status as LeadAdmissionHandoffRow["payer_status"]) : null,
    auth_required: typeof raw.auth_required === "boolean" ? raw.auth_required : null,
    auth_status: typeof raw.auth_status === "string" ? (raw.auth_status as LeadAdmissionHandoffRow["auth_status"]) : null,
    benefits_verified: raw.benefits_verified === true,
    benefits_verified_at: typeof raw.benefits_verified_at === "string" ? raw.benefits_verified_at : null,
    benefits_verified_by: typeof raw.benefits_verified_by === "string" ? raw.benefits_verified_by : null,
    target_soc_date: typeof raw.target_soc_date === "string" ? raw.target_soc_date.slice(0, 10) : null,
    scheduled_soc_at: typeof raw.scheduled_soc_at === "string" ? raw.scheduled_soc_at : null,
    soc_status: typeof raw.soc_status === "string" ? (raw.soc_status as LeadAdmissionHandoffRow["soc_status"]) : null,
    assigned_intake_owner: typeof raw.assigned_intake_owner === "string" ? raw.assigned_intake_owner : null,
    assigned_clinician_id: typeof raw.assigned_clinician_id === "string" ? raw.assigned_clinician_id : null,
    assigned_clinician_name: typeof raw.assigned_clinician_name === "string" ? raw.assigned_clinician_name : null,
    alora_status: typeof raw.alora_status === "string" ? (raw.alora_status as LeadAdmissionHandoffRow["alora_status"]) : null,
    alora_patient_id: typeof raw.alora_patient_id === "string" ? raw.alora_patient_id : null,
    alora_entered_at: typeof raw.alora_entered_at === "string" ? raw.alora_entered_at : null,
    alora_entered_by: typeof raw.alora_entered_by === "string" ? raw.alora_entered_by : null,
    physician_order_status:
      typeof raw.physician_order_status === "string"
        ? (raw.physician_order_status as LeadAdmissionHandoffRow["physician_order_status"])
        : null,
    f2f_status:
      typeof raw.f2f_status === "string" ? (raw.f2f_status as LeadAdmissionHandoffRow["f2f_status"]) : null,
    documents_status:
      typeof raw.documents_status === "string"
        ? (raw.documents_status as LeadAdmissionHandoffRow["documents_status"])
        : null,
    missing_items: arr(raw.missing_items),
    blockers: arr(raw.blockers),
    notes: typeof raw.notes === "string" ? raw.notes : null,
    created_by: typeof raw.created_by === "string" ? raw.created_by : null,
    completed_by: typeof raw.completed_by === "string" ? raw.completed_by : null,
    completed_at: typeof raw.completed_at === "string" ? raw.completed_at : null,
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

function mapChecklistRow(raw: Record<string, unknown>): LeadAdmissionChecklistItemRow {
  return {
    id: String(raw.id),
    admission_handoff_id: String(raw.admission_handoff_id),
    key: String(raw.key),
    label: String(raw.label),
    category: typeof raw.category === "string" ? raw.category : null,
    status: String(raw.status ?? "pending") as LeadAdmissionChecklistItemRow["status"],
    required: raw.required !== false,
    due_at: typeof raw.due_at === "string" ? raw.due_at : null,
    completed_at: typeof raw.completed_at === "string" ? raw.completed_at : null,
    completed_by: typeof raw.completed_by === "string" ? raw.completed_by : null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

export function canEditAdmissionHandoff(staff: StaffProfile | null | undefined): boolean {
  return isCrmLeadsRowPolicyRole(staff);
}

export async function canViewAdmissionHandoff(
  staff: StaffProfile,
  lead: { produced_by_user_id?: string | null }
): Promise<boolean> {
  if (canEditAdmissionHandoff(staff)) return true;
  if (isSalesAgentRole(staff)) {
    return lead.produced_by_user_id === staff.user_id;
  }
  return false;
}

function tabToStatuses(tab: AdmissionHandoffListFilters["tab"]): AdmissionHandoffStatus[] | null {
  switch (tab) {
    case "needs_review":
      return ["draft", "intake_review"];
    case "ready_for_soc":
      return ["ready_for_soc"];
    case "scheduled":
      return ["scheduled"];
    case "on_hold":
      return ["on_hold"];
    case "admitted":
      return ["admitted"];
    default:
      return null;
  }
}

type LeadPrefill = {
  id: string;
  status: string;
  primary_payer_name: string | null;
  payer_name: string | null;
  service_type: string | null;
  service_disciplines: string[] | null;
  referring_facility_id: string | null;
  referring_facility_contact_id: string | null;
  produced_by_user_id: string | null;
  assigned_to_staff_id: string | null;
  converted_patient_id: string | null;
  referral_attribution_json: Record<string, unknown> | null;
  contact: {
    full_name: string | null;
    primary_phone: string | null;
    date_of_birth: string | null;
    city: string | null;
    address_line1: string | null;
  } | null;
};

async function loadLeadPrefill(leadId: string): Promise<LeadPrefill | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select(
      "id, status, primary_payer_name, payer_name, service_type, service_disciplines, referring_facility_id, referring_facility_contact_id, produced_by_user_id, assigned_to_staff_id, converted_patient_id, referral_attribution_json, contact_id"
    )
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!lead?.id) return null;

  let contact: LeadPrefill["contact"] = null;
  const contactId = typeof lead.contact_id === "string" ? lead.contact_id : null;
  if (contactId) {
    const { data: c } = await supabaseAdmin
      .from("contacts")
      .select("full_name, primary_phone, date_of_birth, city, address_line1")
      .eq("id", contactId)
      .maybeSingle();
    if (c) {
      contact = {
        full_name: typeof c.full_name === "string" ? c.full_name : null,
        primary_phone: typeof c.primary_phone === "string" ? c.primary_phone : null,
        date_of_birth: typeof c.date_of_birth === "string" ? c.date_of_birth : null,
        city: typeof c.city === "string" ? c.city : null,
        address_line1: typeof c.address_line1 === "string" ? c.address_line1 : null,
      };
    }
  }

  const attr =
    lead.referral_attribution_json && typeof lead.referral_attribution_json === "object"
      ? (lead.referral_attribution_json as Record<string, unknown>)
      : null;

  return {
    id: String(lead.id),
    status: typeof lead.status === "string" ? lead.status : "new",
    primary_payer_name: typeof lead.primary_payer_name === "string" ? lead.primary_payer_name : null,
    payer_name: typeof lead.payer_name === "string" ? lead.payer_name : null,
    service_type: typeof lead.service_type === "string" ? lead.service_type : null,
    service_disciplines: Array.isArray(lead.service_disciplines) ? lead.service_disciplines.map(String) : null,
    referring_facility_id: typeof lead.referring_facility_id === "string" ? lead.referring_facility_id : null,
    referring_facility_contact_id:
      typeof lead.referring_facility_contact_id === "string" ? lead.referring_facility_contact_id : null,
    produced_by_user_id: typeof lead.produced_by_user_id === "string" ? lead.produced_by_user_id : null,
    assigned_to_staff_id: typeof lead.assigned_to_staff_id === "string" ? lead.assigned_to_staff_id : null,
    converted_patient_id: typeof lead.converted_patient_id === "string" ? lead.converted_patient_id : null,
    referral_attribution_json: attr,
    contact,
  };
}

async function deriveDocumentFields(leadId: string): Promise<{
  documents_status: LeadAdmissionHandoffRow["documents_status"];
  physician_order_status: LeadAdmissionHandoffRow["physician_order_status"];
  f2f_status: LeadAdmissionHandoffRow["f2f_status"];
  missing_items: string[];
}> {
  const missing: string[] = [];
  const summaries = await loadReferralDocumentSummariesByLeadIds([leadId]);
  const s = summaries.get(leadId);
  const count = s?.document_count ?? 0;
  let orderOk = s?.has_physician_order ?? false;
  let faceOk = (s?.has_face_sheet ?? false) || (s?.has_demographics ?? false);

  try {
    const ai = await buildLeadDocumentIntakeSummary(leadId);
    if (ai.documents.length > 0) {
      orderOk = orderOk || ai.order_detected;
      faceOk = faceOk || ai.face_sheet_detected;
      for (const m of ai.missing_items) missing.push(m);
    }
  } catch {
    /* optional */
  }

  let documents_status: LeadAdmissionHandoffRow["documents_status"] = "missing";
  if (count === 0) {
    missing.push("referral documents");
  } else if (!orderOk || !faceOk) {
    documents_status = "partial";
  } else if ((s?.needs_review_count ?? 0) > 0) {
    documents_status = "needs_review";
  } else {
    documents_status = "complete";
  }

  const physician_order_status: LeadAdmissionHandoffRow["physician_order_status"] = orderOk
    ? "received"
    : count > 0
      ? "missing"
      : "unknown";
  const f2f_status: LeadAdmissionHandoffRow["f2f_status"] = faceOk ? "reviewed" : "unknown";

  if (!orderOk) missing.push("physician order");

  return { documents_status, physician_order_status, f2f_status, missing_items: [...new Set(missing)] };
}

export async function createDefaultAdmissionChecklist(admissionId: string): Promise<void> {
  if (!UUID_RE.test(admissionId)) return;

  const { data: existing } = await supabaseAdmin
    .from("lead_admission_handoff_checklist_items")
    .select("id")
    .eq("admission_handoff_id", admissionId)
    .limit(1);
  if (existing?.length) return;

  const rows = DEFAULT_ADMISSION_CHECKLIST_ITEMS.map((item) => ({
    admission_handoff_id: admissionId,
    key: item.key,
    label: item.label,
    category: item.category,
    status: "pending",
    required: true,
  }));

  const { error } = await supabaseAdmin.from("lead_admission_handoff_checklist_items").insert(rows);
  if (error) console.warn("[admission-handoff] checklist create:", error.message);
}

async function buildHandoffPrefill(leadId: string): Promise<Record<string, unknown>> {
  const lead = await loadLeadPrefill(leadId);
  if (!lead) return {};

  const { data: review } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .select("id, payer_status, document_status, missing_items, blockers")
    .eq("lead_id", leadId)
    .maybeSingle();

  const docFields = await deriveDocumentFields(leadId);
  const payer = (lead.primary_payer_name ?? lead.payer_name ?? "").trim();
  const services =
    lead.service_disciplines?.length
      ? lead.service_disciplines
      : lead.service_type
        ? [lead.service_type]
        : null;
  const primaryDiscipline = lead.service_disciplines?.[0] ?? lead.service_type ?? null;

  const reviewMissing = Array.isArray(review?.missing_items)
    ? (review!.missing_items as unknown[]).map(String)
    : [];
  const reviewBlockers = Array.isArray(review?.blockers)
    ? (review!.blockers as unknown[]).map(String)
    : [];
  const missing_items = [...new Set([...docFields.missing_items, ...reviewMissing])];

  let payer_status: LeadAdmissionHandoffRow["payer_status"] = "unknown";
  if (review?.payer_status === "acceptable") payer_status = "verified";
  else if (review?.payer_status === "needs_verification") payer_status = "needs_verification";
  else if (review?.payer_status === "out_of_network" || review?.payer_status === "not_accepted")
    payer_status = "not_accepted";
  else if (payer) payer_status = "needs_verification";

  const attr = lead.referral_attribution_json;
  const sourceLinkId =
    typeof attr?.source_link_id === "string" && UUID_RE.test(attr.source_link_id)
      ? attr.source_link_id
      : null;

  let patientId = lead.converted_patient_id;
  if (!patientId) {
    const { data: leadFull } = await supabaseAdmin
      .from("leads")
      .select("contact_id, converted_patient_id")
      .eq("id", leadId)
      .maybeSingle();
    if (typeof leadFull?.converted_patient_id === "string") patientId = leadFull.converted_patient_id;
    const cid = typeof leadFull?.contact_id === "string" ? leadFull.contact_id : null;
    if (!patientId && cid) {
      const { data: p } = await supabaseAdmin.from("patients").select("id").eq("contact_id", cid).maybeSingle();
      if (p?.id) patientId = String(p.id);
    }
  }

  return {
    lead_id: leadId,
    patient_id: patientId,
    referring_facility_id: lead.referring_facility_id,
    referring_facility_contact_id: lead.referring_facility_contact_id,
    source_link_id: sourceLinkId,
    intake_readiness_review_id: review?.id ? String(review.id) : null,
    status: "intake_review",
    admission_priority: "Normal",
    primary_discipline: primaryDiscipline,
    requested_services: services,
    payer_name: payer || null,
    payer_status,
    auth_status: "unknown",
    auth_required: null,
    benefits_verified: false,
    soc_status: "not_scheduled",
    alora_status: "not_started",
    assigned_intake_owner: lead.assigned_to_staff_id,
    documents_status: docFields.documents_status,
    physician_order_status: docFields.physician_order_status,
    f2f_status: docFields.f2f_status,
    missing_items: missing_items.length ? missing_items : null,
    blockers: reviewBlockers.length ? reviewBlockers : null,
  };
}

export async function isLeadAcceptedForHandoff(leadId: string): Promise<boolean> {
  const { data: review } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .select("readiness_status, accepted_at")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (review?.accepted_at || review?.readiness_status === "accepted") return true;

  const lead = await loadLeadPrefill(leadId);
  return lead?.status === "intake_in_progress" || lead?.status === "ready_to_convert" || lead?.status === "converted";
}

export async function getOrCreateAdmissionHandoffForLead(
  leadId: string,
  createdBy?: string | null,
  options?: { skipAcceptedCheck?: boolean }
): Promise<{ ok: true; handoff: LeadAdmissionHandoffRow } | { ok: false; error: string }> {
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  const { data: existing } = await supabaseAdmin
    .from("lead_admission_handoffs")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existing?.id) {
    return { ok: true, handoff: mapHandoffRow(existing as Record<string, unknown>) };
  }

  if (!options?.skipAcceptedCheck) {
    const accepted = await isLeadAcceptedForHandoff(leadId);
    if (!accepted) return { ok: false, error: "lead_not_accepted" };
  }

  const prefill = await buildHandoffPrefill(leadId);
  if (!prefill.lead_id) return { ok: false, error: "lead_not_found" };

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabaseAdmin
    .from("lead_admission_handoffs")
    .insert({
      ...prefill,
      created_by: createdBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .maybeSingle();

  if (error || !inserted) {
    if (error?.code === "23505") {
      const { data: dup } = await supabaseAdmin
        .from("lead_admission_handoffs")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (dup?.id) return { ok: true, handoff: mapHandoffRow(dup as Record<string, unknown>) };
    }
    console.warn("[admission-handoff] create:", error?.message);
    return { ok: false, error: "create_failed" };
  }

  const handoff = mapHandoffRow(inserted as Record<string, unknown>);
  await createDefaultAdmissionChecklist(handoff.id);

  const lead = await loadLeadPrefill(leadId);
  queueFacilityNotification(() =>
    notifyLeadAdmissionHandoffCreated({
      handoffId: handoff.id,
      leadId,
      facilityId: lead?.referring_facility_id ?? null,
      intakeOwnerUserId: handoff.assigned_intake_owner,
      salesRepUserId: lead?.produced_by_user_id ?? null,
    })
  );

  if (createdBy) {
    await appendLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.manual_note,
      body: "Admission handoff created for SOC planning.",
      metadata: { admission_handoff_id: handoff.id },
      createdByUserId: createdBy,
    });
  }

  return { ok: true, handoff };
}

export async function createAdmissionHandoffOnAccept(
  leadId: string,
  createdBy: string
): Promise<string | null> {
  const result = await getOrCreateAdmissionHandoffForLead(leadId, createdBy, { skipAcceptedCheck: true });
  return result.ok ? result.handoff.id : null;
}

export async function loadAdmissionHandoffByLeadId(leadId: string): Promise<LeadAdmissionHandoffRow | null> {
  const { data } = await supabaseAdmin
    .from("lead_admission_handoffs")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  return data ? mapHandoffRow(data as Record<string, unknown>) : null;
}

export async function syncAdmissionHandoffFromLead(leadId: string): Promise<void> {
  const handoff = await loadAdmissionHandoffByLeadId(leadId);
  if (!handoff) return;

  const lead = await loadLeadPrefill(leadId);
  if (!lead) return;

  const docFields = await deriveDocumentFields(leadId);
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    documents_status: docFields.documents_status,
    physician_order_status: docFields.physician_order_status,
    f2f_status: docFields.f2f_status,
    missing_items: docFields.missing_items.length ? docFields.missing_items : handoff.missing_items,
  };

  if (lead.converted_patient_id && !handoff.patient_id) {
    patch.patient_id = lead.converted_patient_id;
  }
  if (lead.assigned_to_staff_id && !handoff.assigned_intake_owner) {
    patch.assigned_intake_owner = lead.assigned_to_staff_id;
  }
  const payer = (lead.primary_payer_name ?? lead.payer_name ?? "").trim();
  if (payer && !handoff.payer_name) patch.payer_name = payer;

  await supabaseAdmin.from("lead_admission_handoffs").update(patch).eq("id", handoff.id);
}

export async function loadAdmissionHandoffDetail(
  admissionId: string,
  staff?: StaffProfile | null
): Promise<AdmissionHandoffDetail | null> {
  if (!UUID_RE.test(admissionId)) return null;

  const { data: raw } = await supabaseAdmin
    .from("lead_admission_handoffs")
    .select("*")
    .eq("id", admissionId)
    .maybeSingle();
  if (!raw) return null;

  const handoff = mapHandoffRow(raw as Record<string, unknown>);
  const lead = await loadLeadPrefill(handoff.lead_id);
  if (!lead) return null;

  if (staff) {
    const allowed = await canViewAdmissionHandoff(staff, lead);
    if (!allowed) return null;
  }

  const { data: checklistRows } = await supabaseAdmin
    .from("lead_admission_handoff_checklist_items")
    .select("*")
    .eq("admission_handoff_id", admissionId)
    .order("created_at", { ascending: true });

  const checklist = (checklistRows ?? []).map((r) => mapChecklistRow(r as Record<string, unknown>));

  let facility_name: string | null = null;
  if (handoff.referring_facility_id) {
    const { data: f } = await supabaseAdmin
      .from("facilities")
      .select("name")
      .eq("id", handoff.referring_facility_id)
      .maybeSingle();
    facility_name = typeof f?.name === "string" ? f.name : null;
  }

  const docSummaries = await loadReferralDocumentSummariesByLeadIds([handoff.lead_id]);
  const docSummary = docSummaries.get(handoff.lead_id);

  let ai_summary_available = false;
  try {
    const ai = await buildLeadDocumentIntakeSummary(handoff.lead_id);
    ai_summary_available = ai.documents.some((d) => d.ai_processed_at);
  } catch {
    ai_summary_available = false;
  }

  const staffById = new Map<string, { full_name: string | null; email: string | null }>();
  if (handoff.assigned_intake_owner) {
    const { data: sp } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, full_name, email")
      .eq("user_id", handoff.assigned_intake_owner)
      .maybeSingle();
    if (sp) staffById.set(handoff.assigned_intake_owner, { full_name: sp.full_name, email: sp.email });
  }

  return {
    handoff,
    checklist,
    patient_name: (lead.contact?.full_name ?? "").trim() || "Prospect",
    facility_name,
    lead_status: lead.status,
    document_count: docSummary?.document_count ?? 0,
    documents_needing_review: docSummary?.needs_review_count ?? 0,
    ai_summary_available,
    can_edit: staff ? canEditAdmissionHandoff(staff) : false,
    intake_owner_label: staffLabelFromLookup(handoff.assigned_intake_owner, staffById),
    alora_summary_text: await buildAloraIntakeSummaryCopy(admissionId),
  };
}

export async function buildAloraIntakeSummaryCopy(admissionId: string): Promise<string | null> {
  const detail = await loadAdmissionHandoffDetail(admissionId);
  if (!detail) return null;

  const lead = await loadLeadPrefill(detail.handoff.lead_id);
  if (!lead) return null;

  const lines: string[] = [
    "=== Alora Intake Summary (internal) ===",
    `Patient: ${detail.patient_name}`,
    lead.contact?.date_of_birth ? `DOB: ${lead.contact.date_of_birth}` : null,
    lead.contact?.primary_phone ? `Phone: ${lead.contact.primary_phone}` : null,
    lead.contact?.address_line1 ? `Address: ${lead.contact.address_line1}` : null,
    lead.contact?.city ? `City: ${lead.contact.city}` : null,
    detail.handoff.payer_name ? `Payer: ${detail.handoff.payer_name}` : null,
    detail.handoff.requested_services?.length
      ? `Services: ${detail.handoff.requested_services.join(", ")}`
      : null,
    detail.facility_name ? `Referral source: ${detail.facility_name}` : null,
    detail.handoff.target_soc_date ? `Target SOC: ${detail.handoff.target_soc_date}` : null,
    detail.handoff.notes ? `Notes: ${detail.handoff.notes}` : null,
    "",
    "Document checklist:",
    ...(detail.handoff.missing_items?.map((m) => `- Missing: ${m}`) ?? ["- (none flagged)"]),
    "",
    "Handoff checklist:",
    ...detail.checklist.map(
      (c) => `- [${c.status}] ${c.label}${c.notes ? ` — ${c.notes}` : ""}`
    ),
  ].filter(Boolean) as string[];

  return lines.join("\n");
}

export async function listAdmissionHandoffs(
  staff: StaffProfile,
  filters: AdmissionHandoffListFilters = {}
): Promise<AdmissionHandoffListCard[]> {
  let query = supabaseAdmin.from("lead_admission_handoffs").select("*").order("updated_at", { ascending: false });

  const tabStatuses = tabToStatuses(filters.tab ?? null);
  const statuses = filters.status
    ? Array.isArray(filters.status)
      ? filters.status
      : [filters.status]
    : tabStatuses;

  if (statuses?.length) query = query.in("status", statuses);
  if (filters.priority) query = query.eq("admission_priority", filters.priority);
  if (filters.target_soc_from) query = query.gte("target_soc_date", filters.target_soc_from.slice(0, 10));
  if (filters.target_soc_to) query = query.lte("target_soc_date", filters.target_soc_to.slice(0, 10));
  if (filters.assigned_intake_owner) query = query.eq("assigned_intake_owner", filters.assigned_intake_owner);
  if (filters.assigned_clinician_id) query = query.eq("assigned_clinician_id", filters.assigned_clinician_id);
  if (filters.payer_status) query = query.eq("payer_status", filters.payer_status);
  if (filters.auth_status) query = query.eq("auth_status", filters.auth_status);
  if (filters.alora_status) query = query.eq("alora_status", filters.alora_status);
  if (filters.referring_facility_id) query = query.eq("referring_facility_id", filters.referring_facility_id);

  query = query.limit(filters.limit ?? 200);

  const { data: rows, error } = await query;
  if (error) {
    console.warn("[admission-handoff] list:", error.message);
    return [];
  }

  const handoffs = (rows ?? []).map((r) => mapHandoffRow(r as Record<string, unknown>));
  if (handoffs.length === 0) return [];

  const leadIds = handoffs.map((h) => h.lead_id);
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, contact_id, produced_by_user_id")
    .in("id", leadIds);

  const leadMap = new Map<string, { contact_id: string | null; produced_by_user_id: string | null }>();
  for (const l of leads ?? []) {
    leadMap.set(String(l.id), {
      contact_id: typeof l.contact_id === "string" ? l.contact_id : null,
      produced_by_user_id: typeof l.produced_by_user_id === "string" ? l.produced_by_user_id : null,
    });
  }

  if (filters.rep_id) {
    const repId = filters.rep_id;
    for (let i = handoffs.length - 1; i >= 0; i--) {
      const lm = leadMap.get(handoffs[i]!.lead_id);
      if (lm?.produced_by_user_id !== repId) handoffs.splice(i, 1);
    }
  }

  if (!canEditAdmissionHandoff(staff) && isSalesAgentRole(staff)) {
    for (let i = handoffs.length - 1; i >= 0; i--) {
      const lm = leadMap.get(handoffs[i]!.lead_id);
      if (lm?.produced_by_user_id !== staff.user_id) handoffs.splice(i, 1);
    }
  }

  const contactIds = [...new Set([...leadMap.values()].map((l) => l.contact_id).filter(Boolean))] as string[];
  const contactNames = new Map<string, string>();
  if (contactIds.length) {
    const { data: contacts } = await supabaseAdmin.from("contacts").select("id, full_name").in("id", contactIds);
    for (const c of contacts ?? []) {
      contactNames.set(String(c.id), String((c as { full_name?: string }).full_name ?? "Prospect"));
    }
  }

  const facilityIds = [...new Set(handoffs.map((h) => h.referring_facility_id).filter(Boolean))] as string[];
  const facilityNames = new Map<string, string>();
  if (facilityIds.length) {
    const { data: facs } = await supabaseAdmin.from("facilities").select("id, name").in("id", facilityIds);
    for (const f of facs ?? []) facilityNames.set(String(f.id), String((f as { name?: string }).name ?? "Facility"));
  }

  const handoffIds = handoffs.map((h) => h.id);
  const { data: checklistRows } = await supabaseAdmin
    .from("lead_admission_handoff_checklist_items")
    .select("admission_handoff_id, status, required")
    .in("admission_handoff_id", handoffIds);

  const checklistStats = new Map<string, { complete: number; total: number }>();
  for (const id of handoffIds) checklistStats.set(id, { complete: 0, total: 0 });
  for (const row of checklistRows ?? []) {
    const hid = String((row as { admission_handoff_id: string }).admission_handoff_id);
    const st = checklistStats.get(hid) ?? { complete: 0, total: 0 };
    st.total++;
    const status = String((row as { status?: string }).status ?? "");
    if (status === "complete" || status === "not_required") st.complete++;
    checklistStats.set(hid, st);
  }

  const ownerIds = [...new Set(handoffs.map((h) => h.assigned_intake_owner).filter(Boolean))] as string[];
  const staffById = new Map<string, { full_name: string | null; email: string | null }>();
  if (ownerIds.length) {
    const { data: staffRows } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, full_name, email")
      .in("user_id", ownerIds);
    for (const s of staffRows ?? []) {
      staffById.set(String(s.user_id), { full_name: s.full_name, email: s.email });
    }
  }

  const cards: AdmissionHandoffListCard[] = [];
  for (const h of handoffs) {
    if (filters.has_missing_items && !(h.missing_items?.length ?? 0)) continue;

    const lm = leadMap.get(h.lead_id);
    const patient_name = lm?.contact_id ? (contactNames.get(lm.contact_id) ?? "Prospect") : "Prospect";
    const cs = checklistStats.get(h.id) ?? { complete: 0, total: 0 };

    cards.push({
      id: h.id,
      lead_id: h.lead_id,
      patient_id: h.patient_id,
      patient_name,
      facility_id: h.referring_facility_id,
      facility_name: h.referring_facility_id ? (facilityNames.get(h.referring_facility_id) ?? null) : null,
      status: h.status,
      admission_priority: h.admission_priority,
      payer_name: h.payer_name,
      payer_status: h.payer_status,
      requested_services: h.requested_services,
      primary_discipline: h.primary_discipline,
      target_soc_date: h.target_soc_date,
      scheduled_soc_at: h.scheduled_soc_at,
      assigned_clinician_name: h.assigned_clinician_name,
      intake_owner_label: staffLabelFromLookup(h.assigned_intake_owner, staffById),
      checklist_complete: cs.complete,
      checklist_total: cs.total,
      missing_item_count: h.missing_items?.length ?? 0,
      blocker_count: h.blockers?.length ?? 0,
      alora_status: h.alora_status,
      created_at: h.created_at,
    });
  }

  return cards;
}

async function logHandoffActivity(
  leadId: string,
  body: string,
  staffUserId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await appendLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.manual_note,
    body,
    metadata: { admission_handoff: true, ...metadata },
    createdByUserId: staffUserId,
  });
}

export async function updateAdmissionHandoff(
  staff: StaffProfile,
  admissionId: string,
  input: UpdateAdmissionHandoffInput
): Promise<{ ok: true; detail: AdmissionHandoffDetail } | { ok: false; error: string }> {
  if (!canEditAdmissionHandoff(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(admissionId)) return { ok: false, error: "invalid_id" };

  const { data: existing } = await supabaseAdmin
    .from("lead_admission_handoffs")
    .select("id, lead_id, status")
    .eq("id", admissionId)
    .maybeSingle();
  if (!existing?.id) return { ok: false, error: "not_found" };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  const fields: (keyof UpdateAdmissionHandoffInput)[] = [
    "status",
    "admission_priority",
    "primary_discipline",
    "requested_services",
    "payer_name",
    "payer_status",
    "auth_required",
    "auth_status",
    "target_soc_date",
    "scheduled_soc_at",
    "soc_status",
    "assigned_intake_owner",
    "assigned_clinician_id",
    "assigned_clinician_name",
    "alora_status",
    "alora_patient_id",
    "physician_order_status",
    "f2f_status",
    "documents_status",
    "missing_items",
    "blockers",
    "notes",
    "patient_id",
  ];
  for (const f of fields) {
    if (input[f] !== undefined) patch[f] = input[f];
  }

  if (input.benefits_verified === true) {
    patch.benefits_verified = true;
    patch.benefits_verified_at = now;
    patch.benefits_verified_by = staff.user_id;
  } else if (input.benefits_verified === false) {
    patch.benefits_verified = false;
    patch.benefits_verified_at = null;
    patch.benefits_verified_by = null;
  }

  if (input.target_soc_date && !input.soc_status) {
    patch.soc_status = "target_set";
  }

  const { error } = await supabaseAdmin.from("lead_admission_handoffs").update(patch).eq("id", admissionId);
  if (error) {
    console.warn("[admission-handoff] update:", error.message);
    return { ok: false, error: "update_failed" };
  }

  if (input.status && input.status !== existing.status) {
    await logHandoffActivity(
      String(existing.lead_id),
      `Admission handoff status: ${existing.status} → ${input.status}.`,
      staff.user_id,
      { from_status: existing.status, to_status: input.status }
    );
  }

  const detail = await loadAdmissionHandoffDetail(admissionId, staff);
  if (!detail) return { ok: false, error: "not_found" };
  return { ok: true, detail };
}

export async function updateAdmissionChecklistItem(
  staff: StaffProfile,
  itemId: string,
  input: UpdateAdmissionChecklistItemInput
): Promise<{ ok: true; item: LeadAdmissionChecklistItemRow } | { ok: false; error: string }> {
  if (!canEditAdmissionHandoff(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(itemId)) return { ok: false, error: "invalid_id" };

  const { data: existing } = await supabaseAdmin
    .from("lead_admission_handoff_checklist_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (!existing?.id) return { ok: false, error: "not_found" };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (input.status) {
    patch.status = input.status;
    if (input.status === "complete") {
      patch.completed_at = now;
      patch.completed_by = staff.user_id;
    }
  }
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.due_at !== undefined) patch.due_at = input.due_at;

  const { data: updated, error } = await supabaseAdmin
    .from("lead_admission_handoff_checklist_items")
    .update(patch)
    .eq("id", itemId)
    .select("*")
    .maybeSingle();

  if (error || !updated) {
    console.warn("[admission-handoff] checklist update:", error?.message);
    return { ok: false, error: "update_failed" };
  }

  return { ok: true, item: mapChecklistRow(updated as Record<string, unknown>) };
}

async function notifyHandoffStakeholders(
  handoff: LeadAdmissionHandoffRow,
  type: "ready" | "scheduled" | "alora" | "admitted" | "hold"
): Promise<void> {
  const lead = await loadLeadPrefill(handoff.lead_id);
  const base = {
    handoffId: handoff.id,
    leadId: handoff.lead_id,
    facilityId: handoff.referring_facility_id,
    intakeOwnerUserId: handoff.assigned_intake_owner,
    salesRepUserId: lead?.produced_by_user_id ?? null,
  };
  switch (type) {
    case "ready":
      queueFacilityNotification(() => notifyLeadAdmissionReadyForSoc(base));
      break;
    case "scheduled":
      queueFacilityNotification(() => notifyLeadAdmissionSocScheduled(base));
      break;
    case "alora":
      queueFacilityNotification(() => notifyLeadAdmissionAloraEntered(base));
      break;
    case "admitted":
      queueFacilityNotification(() => notifyLeadAdmissionAdmitted(base));
      break;
    case "hold":
      queueFacilityNotification(() => notifyLeadAdmissionOnHold(base));
      break;
  }
}

export async function markAdmissionReadyForSoc(
  staff: StaffProfile,
  admissionId: string,
  note?: string | null
): Promise<{ ok: true; detail: AdmissionHandoffDetail } | { ok: false; error: string }> {
  const result = await updateAdmissionHandoff(staff, admissionId, {
    status: "ready_for_soc",
    notes: note?.trim() || undefined,
  });
  if (!result.ok) return result;

  const handoff = result.detail.handoff;
  await logHandoffActivity(handoff.lead_id, "Admission handoff marked ready for SOC.", staff.user_id);
  await notifyHandoffStakeholders(handoff, "ready");
  return result;
}

export async function markAdmissionScheduled(
  staff: StaffProfile,
  admissionId: string,
  input: { scheduled_soc_at: string; assigned_clinician_name?: string | null; assigned_clinician_id?: string | null }
): Promise<{ ok: true; detail: AdmissionHandoffDetail } | { ok: false; error: string }> {
  if (!input.scheduled_soc_at?.trim()) return { ok: false, error: "scheduled_soc_required" };

  const result = await updateAdmissionHandoff(staff, admissionId, {
    status: "scheduled",
    scheduled_soc_at: input.scheduled_soc_at,
    soc_status: "scheduled",
    assigned_clinician_name: input.assigned_clinician_name ?? undefined,
    assigned_clinician_id: input.assigned_clinician_id ?? undefined,
  });
  if (!result.ok) return result;

  await logHandoffActivity(
    result.detail.handoff.lead_id,
    "SOC scheduled for admission handoff.",
    staff.user_id,
    { scheduled_soc_at: input.scheduled_soc_at }
  );
  await notifyHandoffStakeholders(result.detail.handoff, "scheduled");
  return result;
}

export async function markAloraEntered(
  staff: StaffProfile,
  admissionId: string,
  input: { alora_patient_id?: string | null; note?: string | null }
): Promise<{ ok: true; detail: AdmissionHandoffDetail } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("lead_admission_handoffs")
    .select("id, lead_id")
    .eq("id", admissionId)
    .maybeSingle();
  if (!existing?.id) return { ok: false, error: "not_found" };

  await supabaseAdmin
    .from("lead_admission_handoffs")
    .update({
      alora_status: "entered",
      alora_patient_id: input.alora_patient_id?.trim() || null,
      alora_entered_at: now,
      alora_entered_by: staff.user_id,
      notes: input.note?.trim() || undefined,
      updated_at: now,
    })
    .eq("id", admissionId);

  const { data: checklistItem } = await supabaseAdmin
    .from("lead_admission_handoff_checklist_items")
    .select("id")
    .eq("admission_handoff_id", admissionId)
    .eq("key", "alora_entry")
    .maybeSingle();
  if (checklistItem?.id) {
    await updateAdmissionChecklistItem(staff, String(checklistItem.id), { status: "complete" });
  }

  const detail = await loadAdmissionHandoffDetail(admissionId, staff);
  if (!detail) return { ok: false, error: "not_found" };

  await logHandoffActivity(detail.handoff.lead_id, "Marked entered in Alora.", staff.user_id);
  await notifyHandoffStakeholders(detail.handoff, "alora");
  return { ok: true, detail };
}

export async function markAdmissionAdmitted(
  staff: StaffProfile,
  admissionId: string,
  note?: string | null
): Promise<{ ok: true; detail: AdmissionHandoffDetail } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const result = await updateAdmissionHandoff(staff, admissionId, {
    status: "admitted",
    soc_status: "completed",
    notes: note?.trim() || undefined,
  });
  if (!result.ok) return result;

  await supabaseAdmin
    .from("lead_admission_handoffs")
    .update({ completed_by: staff.user_id, completed_at: now, updated_at: now })
    .eq("id", admissionId);

  await logHandoffActivity(result.detail.handoff.lead_id, "Admission handoff marked admitted.", staff.user_id);
  await notifyHandoffStakeholders(result.detail.handoff, "admitted");
  return result;
}

export async function putAdmissionOnHold(
  staff: StaffProfile,
  admissionId: string,
  note?: string | null
): Promise<{ ok: true; detail: AdmissionHandoffDetail } | { ok: false; error: string }> {
  const result = await updateAdmissionHandoff(staff, admissionId, {
    status: "on_hold",
    notes: note?.trim() || undefined,
  });
  if (!result.ok) return result;
  await logHandoffActivity(result.detail.handoff.lead_id, "Admission handoff placed on hold.", staff.user_id);
  await notifyHandoffStakeholders(result.detail.handoff, "hold");
  return result;
}

export async function cancelAdmissionHandoff(
  staff: StaffProfile,
  admissionId: string,
  note?: string | null
): Promise<{ ok: true; detail: AdmissionHandoffDetail } | { ok: false; error: string }> {
  const result = await updateAdmissionHandoff(staff, admissionId, {
    status: "canceled",
    soc_status: "canceled",
    notes: note?.trim() || undefined,
  });
  if (!result.ok) return result;
  await logHandoffActivity(result.detail.handoff.lead_id, "Admission handoff canceled.", staff.user_id);
  return result;
}

export async function computeAdmissionHandoffAnalytics(input: {
  startDate?: string | null;
  endDate?: string | null;
}): Promise<AdmissionHandoffAnalytics> {
  let q = supabaseAdmin.from("lead_admission_handoffs").select("*");
  if (input.startDate) q = q.gte("created_at", `${input.startDate.slice(0, 10)}T00:00:00.000Z`);
  if (input.endDate) q = q.lte("created_at", `${input.endDate.slice(0, 10)}T23:59:59.999Z`);

  const { data: rows } = await q.limit(5000);
  const handoffs = (rows ?? []).map((r) => mapHandoffRow(r as Record<string, unknown>));

  let readyForSoc = 0;
  let scheduledSoc = 0;
  let admitted = 0;
  let onHold = 0;
  const blockerCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const facilityCounts = new Map<string, { name: string; count: number }>();
  const hoursToReady: number[] = [];
  const hoursToScheduled: number[] = [];

  const leadIds = handoffs.map((h) => h.lead_id);
  const { data: reviews } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .select("lead_id, accepted_at, created_at")
    .in("lead_id", leadIds.length ? leadIds : ["00000000-0000-4000-8000-000000000000"]);

  const acceptedAtByLead = new Map<string, string>();
  for (const r of reviews ?? []) {
    const at = typeof (r as { accepted_at?: string }).accepted_at === "string" ? (r as { accepted_at: string }).accepted_at : null;
    if (at) acceptedAtByLead.set(String((r as { lead_id: string }).lead_id), at);
  }

  const facilityIds = [...new Set(handoffs.map((h) => h.referring_facility_id).filter(Boolean))] as string[];
  const facilityNames = new Map<string, string>();
  if (facilityIds.length) {
    const { data: facs } = await supabaseAdmin.from("facilities").select("id, name").in("id", facilityIds);
    for (const f of facs ?? []) facilityNames.set(String(f.id), String((f as { name?: string }).name ?? "Facility"));
  }

  for (const h of handoffs) {
    if (h.status === "ready_for_soc") readyForSoc++;
    if (h.status === "scheduled") scheduledSoc++;
    if (h.status === "admitted") admitted++;
    if (h.status === "on_hold") onHold++;

    for (const b of h.blockers ?? []) blockerCounts.set(b, (blockerCounts.get(b) ?? 0) + 1);
    for (const m of h.missing_items ?? []) categoryCounts.set("missing", (categoryCounts.get("missing") ?? 0) + 1);

    if (h.referring_facility_id && h.status === "admitted") {
      const fname = facilityNames.get(h.referring_facility_id) ?? "Facility";
      const cur = facilityCounts.get(h.referring_facility_id) ?? { name: fname, count: 0 };
      facilityCounts.set(h.referring_facility_id, { name: fname, count: cur.count + 1 });
    }

    const acceptedAt = acceptedAtByLead.get(h.lead_id);
    if (acceptedAt && h.status === "ready_for_soc") {
      const hrs = (new Date(h.updated_at).getTime() - new Date(acceptedAt).getTime()) / 3_600_000;
      if (Number.isFinite(hrs) && hrs >= 0) hoursToReady.push(hrs);
    }
    if (acceptedAt && h.scheduled_soc_at) {
      const hrs = (new Date(h.scheduled_soc_at).getTime() - new Date(acceptedAt).getTime()) / 3_600_000;
      if (Number.isFinite(hrs) && hrs >= 0) hoursToScheduled.push(hrs);
    }
  }

  const { count: acceptedCount } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .select("id", { count: "exact", head: true })
    .eq("readiness_status", "accepted");

  return {
    acceptedReferrals: acceptedCount ?? 0,
    handoffsCreated: handoffs.length,
    readyForSoc,
    scheduledSoc,
    admitted,
    onHold,
    avgHoursReferralToAccepted: null,
    avgHoursAcceptedToReady:
      hoursToReady.length > 0
        ? Math.round((hoursToReady.reduce((a, b) => a + b, 0) / hoursToReady.length) * 10) / 10
        : null,
    avgHoursAcceptedToScheduled:
      hoursToScheduled.length > 0
        ? Math.round((hoursToScheduled.reduce((a, b) => a + b, 0) / hoursToScheduled.length) * 10) / 10
        : null,
    topBlockers: [...blockerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([item, count]) => ({ item, count })),
    missingByCategory: [...categoryCounts.entries()].map(([category, count]) => ({ category, count })),
    byFacility: [...facilityCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([facilityId, v]) => ({ facilityId, facilityName: v.name, count: v.count })),
  };
}

export type LeadAdmissionHandoffPanelData = {
  handoff: LeadAdmissionHandoffRow | null;
  accepted: boolean;
  can_edit: boolean;
  checklist_complete: number;
  checklist_total: number;
};

export async function loadLeadAdmissionHandoffPanel(
  leadId: string,
  staff: StaffProfile
): Promise<LeadAdmissionHandoffPanelData | null> {
  if (!UUID_RE.test(leadId)) return null;
  const lead = await loadLeadPrefill(leadId);
  if (!lead) return null;

  const allowed = await canViewAdmissionHandoff(staff, lead);
  if (!allowed) return null;

  const accepted = await isLeadAcceptedForHandoff(leadId);
  const handoff = await loadAdmissionHandoffByLeadId(leadId);

  let checklist_complete = 0;
  let checklist_total = 0;
  if (handoff) {
    const { data: items } = await supabaseAdmin
      .from("lead_admission_handoff_checklist_items")
      .select("status")
      .eq("admission_handoff_id", handoff.id);
    checklist_total = items?.length ?? 0;
    checklist_complete = (items ?? []).filter((i) => {
      const st = String((i as { status?: string }).status ?? "");
      return st === "complete" || st === "not_required";
    }).length;
  }

  return {
    handoff,
    accepted,
    can_edit: canEditAdmissionHandoff(staff),
    checklist_complete,
    checklist_total,
  };
}
