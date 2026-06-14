import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { appendLeadActivityRow } from "@/lib/crm/append-lead-activity";
import { getCrmCalendarTomorrowIso } from "@/lib/crm/crm-local-date";
import {
  getReferralChecklistForLead,
  resolveIntakeOwnerUserId,
  updateReferralChecklist,
} from "@/lib/crm/facility-referral-intake";
import { FACILITY_REFERRAL_LOST_REASONS } from "@/lib/crm/facility-referral-pipeline-types";
import {
  notifyLeadIntakeAccepted,
  notifyLeadIntakeClinicalReviewNeeded,
  notifyLeadIntakeDeclined,
  notifyLeadIntakeNeedsInfo,
  notifyLeadIntakeReady,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import { createAdmissionHandoffOnAccept } from "@/lib/crm/lead-admission-handoff";
import { buildLeadDocumentIntakeSummary } from "@/lib/crm/lead-referral-document-ai";
import { loadReferralDocumentSummariesByLeadIds } from "@/lib/crm/lead-referral-documents";
import { listInsurancePayers } from "@/lib/crm/insurance-payers";
import type {
  AcceptLeadReferralInput,
  ClinicalReviewReferralInput,
  DeclineLeadReferralInput,
  LeadIntakeClinicalStatus,
  LeadIntakeDecision,
  LeadIntakeDocumentStatus,
  LeadIntakePayerStatus,
  LeadIntakeReadinessReviewRow,
  LeadIntakeReadinessStatus,
  LeadIntakeReadinessSummary,
  LeadIntakeServiceAreaStatus,
  LeadIntakeStaffingStatus,
  RequestMissingReferralInfoInput,
  UpdateLeadIntakeReadinessInput,
} from "@/lib/crm/lead-intake-readiness-types";
import type { StaffProfile } from "@/lib/staff-profile";
import { isCrmLeadsRowPolicyRole, isSalesAgentRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TERMINAL_LEAD_STATUSES = new Set(["converted", "dead_lead", "duplicate_lead"]);

const HOME_HEALTH_SERVICES = /\b(SN|PT|OT|ST|SLP|HHA|MSW|wound|skilled nursing|physical therapy|occupational|speech)\b/i;

function mapReviewRow(raw: Record<string, unknown>): LeadIntakeReadinessReviewRow {
  const jsonArray = (v: unknown): string[] | null => {
    if (!Array.isArray(v)) return null;
    return v.map((x) => String(x)).filter(Boolean);
  };
  return {
    id: String(raw.id),
    lead_id: String(raw.lead_id),
    readiness_status: String(raw.readiness_status ?? "needs_review") as LeadIntakeReadinessStatus,
    readiness_score: typeof raw.readiness_score === "number" ? raw.readiness_score : null,
    decision: typeof raw.decision === "string" ? (raw.decision as LeadIntakeDecision) : null,
    payer_status: typeof raw.payer_status === "string" ? (raw.payer_status as LeadIntakePayerStatus) : null,
    document_status:
      typeof raw.document_status === "string" ? (raw.document_status as LeadIntakeDocumentStatus) : null,
    clinical_status:
      typeof raw.clinical_status === "string" ? (raw.clinical_status as LeadIntakeClinicalStatus) : null,
    service_area_status:
      typeof raw.service_area_status === "string"
        ? (raw.service_area_status as LeadIntakeServiceAreaStatus)
        : null,
    staffing_status:
      typeof raw.staffing_status === "string" ? (raw.staffing_status as LeadIntakeStaffingStatus) : null,
    missing_items: jsonArray(raw.missing_items),
    blockers: jsonArray(raw.blockers),
    warnings: jsonArray(raw.warnings),
    suggested_next_action:
      typeof raw.suggested_next_action === "string" ? raw.suggested_next_action : null,
    reviewed_by: typeof raw.reviewed_by === "string" ? raw.reviewed_by : null,
    reviewed_at: typeof raw.reviewed_at === "string" ? raw.reviewed_at : null,
    accepted_by: typeof raw.accepted_by === "string" ? raw.accepted_by : null,
    accepted_at: typeof raw.accepted_at === "string" ? raw.accepted_at : null,
    declined_by: typeof raw.declined_by === "string" ? raw.declined_by : null,
    declined_at: typeof raw.declined_at === "string" ? raw.declined_at : null,
    decline_reason: typeof raw.decline_reason === "string" ? raw.decline_reason : null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    ai_summary: typeof raw.ai_summary === "string" ? raw.ai_summary : null,
    ai_json:
      raw.ai_json && typeof raw.ai_json === "object" && !Array.isArray(raw.ai_json)
        ? (raw.ai_json as Record<string, unknown>)
        : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

export function canMakeIntakeReadinessDecisions(staff: StaffProfile | null | undefined): boolean {
  return isCrmLeadsRowPolicyRole(staff);
}

export async function canViewLeadIntakeReadiness(
  staff: StaffProfile,
  lead: { produced_by_user_id?: string | null; referring_facility_id?: string | null }
): Promise<boolean> {
  if (canMakeIntakeReadinessDecisions(staff)) return true;
  if (isSalesAgentRole(staff)) {
    const repId = typeof lead.produced_by_user_id === "string" ? lead.produced_by_user_id : null;
    return repId === staff.user_id;
  }
  return false;
}

type LeadContext = {
  id: string;
  status: string;
  primary_payer_name: string | null;
  payer_name: string | null;
  service_type: string | null;
  service_disciplines: string[] | null;
  referring_facility_id: string | null;
  produced_by_user_id: string | null;
  assigned_to_staff_id: string | null;
  owner_user_id: string | null;
  referral_attribution_json: Record<string, unknown> | null;
  contact: {
    full_name: string | null;
    primary_phone: string | null;
    email: string | null;
    city: string | null;
    address_line1: string | null;
  } | null;
};

async function loadLeadContext(leadId: string): Promise<LeadContext | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select(
      "id, status, primary_payer_name, payer_name, service_type, service_disciplines, referring_facility_id, produced_by_user_id, assigned_to_staff_id, owner_user_id, referral_attribution_json, contact_id"
    )
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead?.id) return null;

  let contact: LeadContext["contact"] = null;
  const contactId = typeof lead.contact_id === "string" ? lead.contact_id : null;
  if (contactId) {
    const { data: c } = await supabaseAdmin
      .from("contacts")
      .select("full_name, primary_phone, email, city, address_line1")
      .eq("id", contactId)
      .maybeSingle();
    if (c) {
      contact = {
        full_name: typeof c.full_name === "string" ? c.full_name : null,
        primary_phone: typeof c.primary_phone === "string" ? c.primary_phone : null,
        email: typeof c.email === "string" ? c.email : null,
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
    service_disciplines: Array.isArray(lead.service_disciplines)
      ? lead.service_disciplines.map(String)
      : null,
    referring_facility_id:
      typeof lead.referring_facility_id === "string" ? lead.referring_facility_id : null,
    produced_by_user_id:
      typeof lead.produced_by_user_id === "string" ? lead.produced_by_user_id : null,
    assigned_to_staff_id:
      typeof lead.assigned_to_staff_id === "string" ? lead.assigned_to_staff_id : null,
    owner_user_id: typeof lead.owner_user_id === "string" ? lead.owner_user_id : null,
    referral_attribution_json: attr,
    contact,
  };
}

function payerText(lead: LeadContext): string {
  return (lead.primary_payer_name ?? lead.payer_name ?? "").trim();
}

function serviceText(lead: LeadContext): string {
  const st = (lead.service_type ?? "").trim();
  if (st) return st;
  if (lead.service_disciplines?.length) return lead.service_disciplines.join(", ");
  const attr = lead.referral_attribution_json;
  const fromAttr =
    typeof attr?.service_needed === "string"
      ? attr.service_needed
      : typeof attr?.services_requested === "string"
        ? attr.services_requested
        : "";
  return fromAttr.trim();
}

async function evaluatePayerStatus(payer: string): Promise<LeadIntakePayerStatus> {
  if (!payer) return "needs_verification";
  const lower = payer.toLowerCase();
  if (/original\s*medicare|medicare\s*part\s*a|medicare\s*part\s*b|^medicare$/i.test(lower)) {
    return "acceptable";
  }
  const payers = await listInsurancePayers();
  const normalized = lower.replace(/[^a-z0-9]+/g, " ").trim();
  for (const p of payers) {
    const pn = p.normalized_name || p.payer_name.toLowerCase();
    if (normalized.includes(pn) || pn.includes(normalized)) return "acceptable";
  }
  if (/medicare advantage|\bma\b|medicaid|managed care|hmo|ppo/i.test(lower)) {
    return "needs_verification";
  }
  return "needs_verification";
}

function evaluateClinicalStatus(service: string): LeadIntakeClinicalStatus {
  if (!service) return "needs_clinical_review";
  if (HOME_HEALTH_SERVICES.test(service)) return "appears_appropriate";
  return "needs_clinical_review";
}

function evaluateServiceAreaStatus(lead: LeadContext): LeadIntakeServiceAreaStatus {
  const city = (lead.contact?.city ?? "").trim();
  const address = (lead.contact?.address_line1 ?? "").trim();
  if (!city && !address) return "unknown";
  return "needs_review";
}

function evaluateStaffingStatus(service: string): LeadIntakeStaffingStatus {
  if (!service) return "unknown";
  return "needs_review";
}

function computeReadinessScore(input: {
  hasContact: boolean;
  payerStatus: LeadIntakePayerStatus;
  documentStatus: LeadIntakeDocumentStatus;
  hasService: boolean;
  hasAttribution: boolean;
  blockers: string[];
}): number {
  let score = 0;
  if (input.hasContact) score += 25;
  if (input.payerStatus === "acceptable") score += 20;
  else if (input.payerStatus === "needs_verification") score += 10;
  if (input.documentStatus === "complete") score += 20;
  else if (input.documentStatus === "partial") score += 10;
  if (input.hasService) score += 15;
  if (input.hasAttribution) score += 10;
  if (input.blockers.length === 0) score += 10;
  return Math.min(100, Math.max(0, score));
}

function deriveReadinessStatus(input: {
  score: number;
  blockers: string[];
  missingItems: string[];
  payerStatus: LeadIntakePayerStatus;
  documentStatus: LeadIntakeDocumentStatus;
  clinicalStatus: LeadIntakeClinicalStatus;
  staffingStatus: LeadIntakeStaffingStatus;
  existingStatus?: LeadIntakeReadinessStatus;
}): { status: LeadIntakeReadinessStatus; suggestedAction: string } {
  if (input.existingStatus === "accepted" || input.existingStatus === "declined") {
    return {
      status: input.existingStatus,
      suggestedAction:
        input.existingStatus === "accepted"
          ? "Referral accepted — proceed with intake tasks."
          : "Referral declined — update referral source if needed.",
    };
  }

  if (input.blockers.some((b) => /out of (service area|network)|not appropriate|staffing unavailable/i.test(b))) {
    return { status: "cannot_accept", suggestedAction: "Review blockers before proceeding." };
  }
  if (input.payerStatus === "out_of_network" || input.payerStatus === "not_accepted") {
    return { status: "needs_payer_review", suggestedAction: "Verify payer eligibility or decline." };
  }
  if (input.clinicalStatus === "needs_clinical_review" || input.clinicalStatus === "not_appropriate") {
    return { status: "needs_clinical_review", suggestedAction: "Assign clinical review." };
  }
  if (input.staffingStatus === "unavailable") {
    return { status: "needs_staffing_review", suggestedAction: "Confirm staffing availability." };
  }
  if (input.missingItems.length > 0 || input.documentStatus === "missing" || input.documentStatus === "partial") {
    return { status: "needs_info", suggestedAction: "Request missing referral information." };
  }
  if (input.score >= 80 && input.blockers.length === 0) {
    return { status: "ready", suggestedAction: "Ready for intake acceptance review." };
  }
  if (input.score >= 50) {
    return { status: "needs_review", suggestedAction: "Complete intake readiness review." };
  }
  return { status: "needs_info", suggestedAction: "Gather missing referral details." };
}

export async function buildLeadIntakeReadinessReview(leadId: string): Promise<Omit<
  LeadIntakeReadinessReviewRow,
  "id" | "lead_id" | "created_at" | "updated_at" | "reviewed_by" | "reviewed_at" | "accepted_by" | "accepted_at" | "declined_by" | "declined_at" | "decline_reason" | "notes" | "decision"
> | null> {
  if (!UUID_RE.test(leadId)) return null;

  const lead = await loadLeadContext(leadId);
  if (!lead) return null;

  const missingItems = new Set<string>();
  const blockers = new Set<string>();
  const warnings = new Set<string>();

  const docSummaries = await loadReferralDocumentSummariesByLeadIds([leadId]);
  const docSummary = docSummaries.get(leadId);
  const documentCount = docSummary?.document_count ?? 0;

  let orderDetected = docSummary?.has_physician_order ?? false;
  let faceSheetDetected =
    (docSummary?.has_face_sheet ?? false) || (docSummary?.has_demographics ?? false);
  let insuranceDetected = docSummary?.has_insurance_card ?? false;

  let aiSummaryText: string | null = null;
  let aiJson: Record<string, unknown> | null = null;

  try {
    const aiSummary = await buildLeadDocumentIntakeSummary(leadId);
    if (aiSummary.documents.length > 0) {
      orderDetected = orderDetected || aiSummary.order_detected;
      faceSheetDetected = faceSheetDetected || aiSummary.face_sheet_detected;
      insuranceDetected = insuranceDetected || aiSummary.insurance_detected;
      for (const m of aiSummary.missing_items) missingItems.add(m);
      for (const w of aiSummary.warnings) warnings.add(w);
      if (aiSummary.combined_summary) aiSummaryText = aiSummary.combined_summary.slice(0, 4000);
      aiJson = {
        services_requested: aiSummary.services_requested,
        ai_ready_count: aiSummary.ai_ready_count,
        ai_pending_count: aiSummary.ai_pending_count,
      };
    }
  } catch (e) {
    console.warn("[lead-intake-readiness] ai summary:", e);
  }

  let documentStatus: LeadIntakeDocumentStatus;
  if (documentCount === 0) {
    documentStatus = "missing";
    missingItems.add("referral documents");
  } else if (!orderDetected) {
    documentStatus = "partial";
    missingItems.add("physician order");
  } else if (!faceSheetDetected) {
    documentStatus = "partial";
    missingItems.add("demographics / face sheet");
  } else if ((docSummary?.needs_review_count ?? 0) > 0) {
    documentStatus = "needs_review";
  } else if (!insuranceDetected && !payerText(lead)) {
    documentStatus = "partial";
    missingItems.add("insurance information");
  } else {
    documentStatus = "complete";
  }

  const payer = payerText(lead);
  const payerStatus = await evaluatePayerStatus(payer);
  if (!payer) missingItems.add("insurance information");

  const service = serviceText(lead);
  const clinicalStatus = evaluateClinicalStatus(service);
  if (!service) missingItems.add("service / discipline requested");

  const serviceAreaStatus = evaluateServiceAreaStatus(lead);
  const staffingStatus = evaluateStaffingStatus(service);

  const checklist = await getReferralChecklistForLead(leadId);
  if (checklist && !checklist.patient_contacted) warnings.add("Patient not yet contacted");
  if (checklist && !checklist.insurance_verified && payerStatus === "needs_verification") {
    warnings.add("Insurance not verified");
  }

  const hasContact = Boolean(
    (lead.contact?.primary_phone ?? "").trim() || (lead.contact?.email ?? "").trim()
  );
  if (!hasContact) missingItems.add("patient contact information");

  const hasAttribution = Boolean(
    lead.referring_facility_id ||
      lead.referral_attribution_json?.source_type ||
      lead.referral_attribution_json?.source_name
  );

  const blockersArr = [...blockers];
  const missingArr = [...missingItems];
  const score = computeReadinessScore({
    hasContact,
    payerStatus,
    documentStatus,
    hasService: Boolean(service),
    hasAttribution,
    blockers: blockersArr,
  });

  const { status, suggestedAction } = deriveReadinessStatus({
    score,
    blockers: blockersArr,
    missingItems: missingArr,
    payerStatus,
    documentStatus,
    clinicalStatus,
    staffingStatus,
  });

  return {
    readiness_status: status,
    readiness_score: score,
    payer_status: payerStatus,
    document_status: documentStatus,
    clinical_status: clinicalStatus,
    service_area_status: serviceAreaStatus,
    staffing_status: staffingStatus,
    missing_items: missingArr.length ? missingArr : null,
    blockers: blockersArr.length ? blockersArr : null,
    warnings: warnings.size ? [...warnings] : null,
    suggested_next_action: suggestedAction,
    ai_summary: aiSummaryText,
    ai_json: aiJson,
  };
}

async function ensureReviewRow(leadId: string): Promise<LeadIntakeReadinessReviewRow | null> {
  const { data: existing } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existing?.id) return mapReviewRow(existing as Record<string, unknown>);

  const built = await buildLeadIntakeReadinessReview(leadId);
  if (!built) return null;

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .insert({
      lead_id: leadId,
      ...built,
      decision: "pending",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .maybeSingle();

  if (error || !inserted) {
    console.warn("[lead-intake-readiness] ensure insert:", error?.message);
    return null;
  }
  return mapReviewRow(inserted as Record<string, unknown>);
}

export async function loadLeadIntakeReadiness(
  leadId: string,
  staff?: StaffProfile | null
): Promise<LeadIntakeReadinessSummary | null> {
  if (!UUID_RE.test(leadId)) return null;

  const lead = await loadLeadContext(leadId);
  if (!lead) return null;

  if (staff) {
    const allowed = await canViewLeadIntakeReadiness(staff, lead);
    if (!allowed) return null;
  }

  const review = await ensureReviewRow(leadId);
  if (!review) return null;

  return {
    review,
    can_decide: staff ? canMakeIntakeReadinessDecisions(staff) : false,
    lead_status: lead.status,
    is_terminal: TERMINAL_LEAD_STATUSES.has(lead.status) || review.readiness_status === "accepted" || review.readiness_status === "declined",
  };
}

export async function refreshLeadIntakeReadiness(
  leadId: string,
  staff?: StaffProfile | null
): Promise<LeadIntakeReadinessSummary | null> {
  if (!UUID_RE.test(leadId)) return null;

  const existing = await ensureReviewRow(leadId);
  if (!existing) return null;

  if (existing.readiness_status === "accepted" || existing.readiness_status === "declined") {
    return loadLeadIntakeReadiness(leadId, staff);
  }

  const built = await buildLeadIntakeReadinessReview(leadId);
  if (!built) return null;

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .update({
      ...built,
      decision: existing.decision === "accept" || existing.decision === "decline" ? existing.decision : "pending",
      updated_at: now,
      reviewed_by: staff?.user_id ?? existing.reviewed_by,
      reviewed_at: staff ? now : existing.reviewed_at,
    })
    .eq("lead_id", leadId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.warn("[lead-intake-readiness] refresh:", error.message);
    return loadLeadIntakeReadiness(leadId, staff);
  }

  if (staff && built.readiness_status === "ready") {
    const ctx = await loadLeadContext(leadId);
    queueFacilityNotification(() =>
      notifyLeadIntakeReady({ leadId, facilityId: ctx?.referring_facility_id ?? null })
    );
  }

  return loadLeadIntakeReadiness(leadId, staff);
}

export async function updateLeadIntakeReadiness(
  staff: StaffProfile,
  leadId: string,
  input: UpdateLeadIntakeReadinessInput
): Promise<{ ok: true; summary: LeadIntakeReadinessSummary } | { ok: false; error: string }> {
  if (!canMakeIntakeReadinessDecisions(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  await ensureReviewRow(leadId);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.readiness_status) patch.readiness_status = input.readiness_status;
  if (input.decision !== undefined) patch.decision = input.decision;
  if (input.payer_status !== undefined) patch.payer_status = input.payer_status;
  if (input.document_status !== undefined) patch.document_status = input.document_status;
  if (input.clinical_status !== undefined) patch.clinical_status = input.clinical_status;
  if (input.service_area_status !== undefined) patch.service_area_status = input.service_area_status;
  if (input.staffing_status !== undefined) patch.staffing_status = input.staffing_status;
  if (input.missing_items !== undefined) patch.missing_items = input.missing_items;
  if (input.blockers !== undefined) patch.blockers = input.blockers;
  if (input.warnings !== undefined) patch.warnings = input.warnings;
  if (input.suggested_next_action !== undefined) patch.suggested_next_action = input.suggested_next_action;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { error } = await supabaseAdmin.from("lead_intake_readiness_reviews").update(patch).eq("lead_id", leadId);
  if (error) {
    console.warn("[lead-intake-readiness] update:", error.message);
    return { ok: false, error: "update_failed" };
  }

  const summary = await loadLeadIntakeReadiness(leadId, staff);
  if (!summary) return { ok: false, error: "not_found" };
  return { ok: true, summary };
}

function declineReasonToLostReason(reason: string): string {
  const r = reason.trim().toLowerCase();
  if (r.includes("payer")) return "Insurance not accepted";
  if (r.includes("service area")) return "Outside service area";
  if (r.includes("staffing")) return "Other";
  if (r.includes("home health")) return "Not home health eligible";
  if (r.includes("duplicate")) return "Duplicate lead";
  if (r.includes("contact")) return "Unable to contact patient";
  return FACILITY_REFERRAL_LOST_REASONS.includes(reason as (typeof FACILITY_REFERRAL_LOST_REASONS)[number])
    ? reason
    : "Other";
}

async function insertCrmTask(input: {
  leadId: string;
  title: string;
  description?: string;
  dueAt: string;
  assignedTo: string | null;
  createdBy: string;
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
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
    console.warn("[lead-intake-readiness] crm task:", error?.message);
    return null;
  }
  return String(data.id);
}

async function insertFacilityFollowUpTask(input: {
  facilityId: string;
  contactId?: string | null;
  assignedTo: string;
  title: string;
  description?: string;
  dueAt: string;
  createdBy: string;
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .insert({
      facility_id: input.facilityId,
      contact_id: input.contactId ?? null,
      assigned_to: input.assignedTo,
      title: input.title,
      description: input.description ?? null,
      due_at: input.dueAt,
      status: "open",
      priority: "Normal",
      source: "facility_referral",
      created_by: input.createdBy,
    })
    .select("id")
    .maybeSingle();
  if (error || !data?.id) {
    console.warn("[lead-intake-readiness] facility task:", error?.message);
    return null;
  }
  return String(data.id);
}

async function insertFacilityDeclineActivity(input: {
  facilityId: string;
  staffUserId: string;
  declineReason: string;
  leadId: string;
}): Promise<void> {
  const safeReason = input.declineReason.slice(0, 120);
  await supabaseAdmin.from("facility_activities").insert({
    facility_id: input.facilityId,
    staff_user_id: input.staffUserId,
    activity_type: "Referral Follow-up",
    outcome: "Referral declined",
    activity_at: new Date().toISOString(),
    notes: `Referral declined (${safeReason}). See CRM lead for details.`,
    linked_lead_id: input.leadId,
  });
}

export async function requestMissingReferralInfo(
  staff: StaffProfile,
  leadId: string,
  input: RequestMissingReferralInfoInput
): Promise<{ ok: true; summary: LeadIntakeReadinessSummary } | { ok: false; error: string }> {
  if (!canMakeIntakeReadinessDecisions(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  const lead = await loadLeadContext(leadId);
  if (!lead) return { ok: false, error: "lead_not_found" };

  const missing = input.missing_items.map((m) => m.trim()).filter(Boolean);
  if (missing.length === 0) return { ok: false, error: "missing_items_required" };

  const now = new Date().toISOString();
  const dueAt =
    input.due_at?.trim() ||
    new Date(`${getCrmCalendarTomorrowIso()}T17:00:00`).toISOString();

  await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .upsert(
      {
        lead_id: leadId,
        readiness_status: "needs_info",
        decision: "request_info",
        missing_items: missing,
        suggested_next_action: "Waiting on missing referral information.",
        notes: input.message?.trim() || null,
        updated_at: now,
      },
      { onConflict: "lead_id" }
    );

  const intakeOwner = resolveIntakeOwnerUserId(staff, lead);
  if (input.create_follow_up_task !== false) {
    await insertCrmTask({
      leadId,
      title: "Request missing referral information",
      description: [input.message?.trim(), `Missing: ${missing.join(", ")}`].filter(Boolean).join("\n"),
      dueAt,
      assignedTo: intakeOwner,
      createdBy: staff.user_id,
    });
  }

  if (lead.referring_facility_id) {
    const { data: facility } = await supabaseAdmin
      .from("facilities")
      .select("name")
      .eq("id", lead.referring_facility_id)
      .maybeSingle();
    const facilityName = String(facility?.name ?? "Facility");
    const repId = lead.produced_by_user_id ?? staff.user_id;
    await insertFacilityFollowUpTask({
      facilityId: lead.referring_facility_id,
      assignedTo: repId,
      title: `Request missing referral documents from ${facilityName}`,
      description: input.message?.trim() || `Missing: ${missing.join(", ")}`,
      dueAt,
      createdBy: staff.user_id,
    });
  }

  await appendLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.manual_note,
    body: `Missing referral info requested: ${missing.join(", ")}.${input.message ? ` ${input.message.trim()}` : ""}`,
    metadata: { intake_readiness: true, missing_items: missing },
    createdByUserId: staff.user_id,
  });

  queueFacilityNotification(() =>
    notifyLeadIntakeNeedsInfo({
      leadId,
      facilityId: lead.referring_facility_id,
      salesRepUserId: lead.produced_by_user_id,
    })
  );

  const summary = await loadLeadIntakeReadiness(leadId, staff);
  if (!summary) return { ok: false, error: "not_found" };
  return { ok: true, summary };
}

export async function assignClinicalReview(
  staff: StaffProfile,
  leadId: string,
  input: ClinicalReviewReferralInput
): Promise<{ ok: true; summary: LeadIntakeReadinessSummary } | { ok: false; error: string }> {
  if (!canMakeIntakeReadinessDecisions(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  const lead = await loadLeadContext(leadId);
  if (!lead) return { ok: false, error: "lead_not_found" };

  let assignTo = input.assign_to?.trim() || null;
  if (assignTo && !UUID_RE.test(assignTo)) assignTo = null;
  if (!assignTo) {
    const { data: managers } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id")
      .eq("is_active", true)
      .in("role", ["manager", "admin", "super_admin", "don"])
      .limit(1);
    assignTo = managers?.[0]?.user_id ? String(managers[0].user_id) : staff.user_id;
  }

  const now = new Date().toISOString();
  const dueAt =
    input.due_at?.trim() ||
    new Date(`${getCrmCalendarTomorrowIso()}T17:00:00`).toISOString();

  await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .upsert(
      {
        lead_id: leadId,
        readiness_status: "needs_clinical_review",
        decision: "clinical_review",
        clinical_status: "needs_clinical_review",
        suggested_next_action: "Awaiting clinical review.",
        notes: input.clinical_note?.trim() || null,
        updated_at: now,
      },
      { onConflict: "lead_id" }
    );

  await insertCrmTask({
    leadId,
    title: "Clinical review — referral intake",
    description: input.clinical_note?.trim() || "Review referral for home health appropriateness.",
    dueAt,
    assignedTo: assignTo,
    createdBy: staff.user_id,
  });

  await appendLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.manual_note,
    body: `Referral sent to clinical review.${input.clinical_note ? ` ${input.clinical_note.trim()}` : ""}`,
    metadata: { intake_readiness: true, clinical_review: true },
    createdByUserId: staff.user_id,
  });

  queueFacilityNotification(() =>
    notifyLeadIntakeClinicalReviewNeeded({
      leadId,
      assignToUserId: assignTo,
      facilityId: lead.referring_facility_id,
    })
  );

  const summary = await loadLeadIntakeReadiness(leadId, staff);
  if (!summary) return { ok: false, error: "not_found" };
  return { ok: true, summary };
}

export async function acceptLeadReferral(
  staff: StaffProfile,
  leadId: string,
  input: AcceptLeadReferralInput
): Promise<
  | { ok: true; summary: LeadIntakeReadinessSummary; admission_handoff_id: string | null }
  | { ok: false; error: string }
> {
  if (!canMakeIntakeReadinessDecisions(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  const lead = await loadLeadContext(leadId);
  if (!lead) return { ok: false, error: "lead_not_found" };
  if (lead.status === "converted") return { ok: false, error: "already_converted" };

  const { data: existingReview } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .select("readiness_status, accepted_at")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existingReview?.accepted_at) return { ok: false, error: "already_accepted" };

  const now = new Date().toISOString();
  const intakeOwnerId =
    input.intake_owner_id?.trim() && UUID_RE.test(input.intake_owner_id.trim())
      ? input.intake_owner_id.trim()
      : resolveIntakeOwnerUserId(staff, lead);

  const leadPatch: Record<string, unknown> = {
    status: "intake_in_progress",
    updated_at: now,
  };
  if (intakeOwnerId) leadPatch.assigned_to_staff_id = intakeOwnerId;

  await supabaseAdmin.from("leads").update(leadPatch).eq("id", leadId).is("deleted_at", null);

  await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .upsert(
      {
        lead_id: leadId,
        readiness_status: "accepted",
        decision: "accept",
        accepted_by: staff.user_id,
        accepted_at: now,
        suggested_next_action: "Referral accepted — proceed with intake.",
        notes: input.note?.trim() || null,
        updated_at: now,
      },
      { onConflict: "lead_id" }
    );

  await updateReferralChecklist(staff, leadId, { service_need_confirmed: true });

  const dueTomorrow = new Date(`${getCrmCalendarTomorrowIso()}T17:00:00`).toISOString();
  const review = await ensureReviewRow(leadId);
  if (review?.payer_status === "needs_verification") {
    await insertCrmTask({
      leadId,
      title: "Verify benefits / payer",
      description: "Referral accepted — verify insurance eligibility.",
      dueAt: dueTomorrow,
      assignedTo: intakeOwnerId,
      createdBy: staff.user_id,
    });
  }
  if (review?.document_status === "partial" || review?.document_status === "missing") {
    await insertCrmTask({
      leadId,
      title: "Obtain missing physician order / documents",
      description: "Referral accepted — complete required documentation.",
      dueAt: dueTomorrow,
      assignedTo: intakeOwnerId,
      createdBy: staff.user_id,
    });
  }
  if (input.create_soc_task) {
    await insertCrmTask({
      leadId,
      title: "Schedule SOC / assign clinician",
      description: input.note?.trim() || "Plan start of care after referral acceptance.",
      dueAt: dueTomorrow,
      assignedTo: intakeOwnerId,
      createdBy: staff.user_id,
    });
  }

  await appendLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.status_changed,
    body: input.note?.trim() || "Referral accepted by intake.",
    metadata: { intake_readiness: true, accepted: true },
    createdByUserId: staff.user_id,
  });

  queueFacilityNotification(() =>
    notifyLeadIntakeAccepted({
      leadId,
      facilityId: lead.referring_facility_id,
      salesRepUserId: lead.produced_by_user_id,
    })
  );

  const admissionHandoffId = await createAdmissionHandoffOnAccept(leadId, staff.user_id);

  const summary = await loadLeadIntakeReadiness(leadId, staff);
  if (!summary) return { ok: false, error: "not_found" };
  return { ok: true, summary, admission_handoff_id: admissionHandoffId };
}

export async function declineLeadReferral(
  staff: StaffProfile,
  leadId: string,
  input: DeclineLeadReferralInput
): Promise<{ ok: true; summary: LeadIntakeReadinessSummary } | { ok: false; error: string }> {
  if (!canMakeIntakeReadinessDecisions(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  const reason = (input.decline_reason ?? "").trim();
  if (!reason) return { ok: false, error: "decline_reason_required" };

  const lead = await loadLeadContext(leadId);
  if (!lead) return { ok: false, error: "lead_not_found" };
  if (lead.status === "converted") return { ok: false, error: "already_converted" };

  const { data: existingReview } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .select("declined_at")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existingReview?.declined_at) return { ok: false, error: "already_declined" };

  const lostReason = declineReasonToLostReason(reason);
  const now = new Date().toISOString();
  const meta = lead.referral_attribution_json ? { ...lead.referral_attribution_json } : {};
  meta.lost_reason = lostReason;
  meta.lost_at = now;

  await supabaseAdmin
    .from("leads")
    .update({
      status: "dead_lead",
      referral_attribution_json: meta,
      updated_at: now,
    })
    .eq("id", leadId)
    .is("deleted_at", null);

  await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .upsert(
      {
        lead_id: leadId,
        readiness_status: "declined",
        decision: "decline",
        declined_by: staff.user_id,
        declined_at: now,
        decline_reason: reason,
        suggested_next_action: "Referral declined.",
        notes: input.internal_note?.trim() || null,
        updated_at: now,
      },
      { onConflict: "lead_id" }
    );

  await updateReferralChecklist(staff, leadId, { converted_or_closed: true });

  if (lead.referring_facility_id) {
    await insertFacilityDeclineActivity({
      facilityId: lead.referring_facility_id,
      staffUserId: staff.user_id,
      declineReason: reason,
      leadId,
    });
  }

  await appendLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.status_changed,
    body: `Referral declined: ${reason}.${input.internal_note ? ` ${input.internal_note.trim()}` : ""}`,
    metadata: { intake_readiness: true, declined: true, decline_reason: reason, lost_reason: lostReason },
    createdByUserId: staff.user_id,
  });

  queueFacilityNotification(() =>
    notifyLeadIntakeDeclined({
      leadId,
      facilityId: lead.referring_facility_id,
      salesRepUserId: lead.produced_by_user_id,
      declineReason: reason,
    })
  );

  const summary = await loadLeadIntakeReadiness(leadId, staff);
  if (!summary) return { ok: false, error: "not_found" };
  return { ok: true, summary };
}

export type LeadIntakeReadinessBatchSummary = {
  readiness_status: LeadIntakeReadinessStatus;
  readiness_score: number | null;
  missing_item_count: number;
  suggested_next_action: string | null;
};

export async function loadIntakeReadinessByLeadIds(
  leadIds: string[]
): Promise<Map<string, LeadIntakeReadinessBatchSummary>> {
  const out = new Map<string, LeadIntakeReadinessBatchSummary>();
  const ids = leadIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return out;

  const { data: rows } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .select("lead_id, readiness_status, readiness_score, missing_items, suggested_next_action")
    .in("lead_id", ids);

  for (const raw of rows ?? []) {
    const leadId = String((raw as { lead_id: string }).lead_id);
    const missing = Array.isArray((raw as { missing_items?: unknown }).missing_items)
      ? ((raw as { missing_items: unknown[] }).missing_items as unknown[])
      : [];
    out.set(leadId, {
      readiness_status: String((raw as { readiness_status?: string }).readiness_status ?? "needs_review") as LeadIntakeReadinessStatus,
      readiness_score:
        typeof (raw as { readiness_score?: number }).readiness_score === "number"
          ? (raw as { readiness_score: number }).readiness_score
          : null,
      missing_item_count: missing.length,
      suggested_next_action:
        typeof (raw as { suggested_next_action?: string }).suggested_next_action === "string"
          ? (raw as { suggested_next_action: string }).suggested_next_action
          : null,
    });
  }
  return out;
}

export async function countReferralsNeedingInfoByFacilityIds(
  facilityIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (facilityIds.length === 0) return out;

  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, referring_facility_id")
    .in("referring_facility_id", facilityIds)
    .is("deleted_at", null)
    .not("status", "in", '("converted","dead_lead","duplicate_lead")')
    .limit(2000);

  const leadIds = (leads ?? []).map((l) => String((l as { id: string }).id));
  const readiness = await loadIntakeReadinessByLeadIds(leadIds);

  for (const l of leads ?? []) {
    const leadId = String((l as { id: string }).id);
    const facilityId = typeof (l as { referring_facility_id?: string }).referring_facility_id === "string"
      ? (l as { referring_facility_id: string }).referring_facility_id
      : null;
    if (!facilityId) continue;
    const r = readiness.get(leadId);
    if (r?.readiness_status === "needs_info") {
      out.set(facilityId, (out.get(facilityId) ?? 0) + 1);
    }
  }
  return out;
}

export async function computeIntakeReadinessAnalytics(input: {
  startDate?: string | null;
  endDate?: string | null;
  facilityId?: string | null;
}): Promise<import("@/lib/crm/lead-intake-readiness-types").IntakeReadinessAnalytics> {
  let leadQuery = supabaseAdmin
    .from("leads")
    .select("id, referring_facility_id, created_at")
    .is("deleted_at", null)
    .not("referring_facility_id", "is", null);

  if (input.facilityId) leadQuery = leadQuery.eq("referring_facility_id", input.facilityId);
  if (input.startDate) leadQuery = leadQuery.gte("created_at", `${input.startDate.slice(0, 10)}T00:00:00.000Z`);
  if (input.endDate) leadQuery = leadQuery.lte("created_at", `${input.endDate.slice(0, 10)}T23:59:59.999Z`);

  const { data: leadRows } = await leadQuery.limit(5000);
  const leadIds = (leadRows ?? []).map((r) => String((r as { id: string }).id));

  const { data: reviews } = await supabaseAdmin
    .from("lead_intake_readiness_reviews")
    .select("*")
    .in("lead_id", leadIds.length ? leadIds : ["00000000-0000-4000-8000-000000000000"]);

  const reviewRows = (reviews ?? []).map((r) => mapReviewRow(r as Record<string, unknown>));

  let readyReferrals = 0;
  let needsInfo = 0;
  let needsPayerReview = 0;
  let needsClinicalReview = 0;
  let accepted = 0;
  let declined = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  const missingCounts = new Map<string, number>();
  const declineCounts = new Map<string, number>();
  const facilityAccepted = new Map<string, { name: string; count: number }>();
  const facilityIncomplete = new Map<string, { name: string; count: number }>();
  const acceptanceHours: number[] = [];

  const leadFacilityMap = new Map<string, string>();
  for (const l of leadRows ?? []) {
    const id = String((l as { id: string }).id);
    const fid = typeof (l as { referring_facility_id?: string }).referring_facility_id === "string"
      ? (l as { referring_facility_id: string }).referring_facility_id
      : null;
    if (fid) leadFacilityMap.set(id, fid);
  }

  const facilityIds = [...new Set([...leadFacilityMap.values()])];
  const facilityNames = new Map<string, string>();
  if (facilityIds.length) {
    const { data: facs } = await supabaseAdmin.from("facilities").select("id, name").in("id", facilityIds);
    for (const f of facs ?? []) {
      facilityNames.set(String((f as { id: string }).id), String((f as { name?: string }).name ?? "Facility"));
    }
  }

  for (const r of reviewRows) {
    switch (r.readiness_status) {
      case "ready":
        readyReferrals++;
        break;
      case "needs_info":
        needsInfo++;
        break;
      case "needs_payer_review":
        needsPayerReview++;
        break;
      case "needs_clinical_review":
        needsClinicalReview++;
        break;
      case "accepted":
        accepted++;
        break;
      case "declined":
        declined++;
        break;
      default:
        break;
    }
    if (r.readiness_score != null) {
      scoreSum += r.readiness_score;
      scoreCount++;
    }
    for (const m of r.missing_items ?? []) {
      missingCounts.set(m, (missingCounts.get(m) ?? 0) + 1);
    }
    if (r.decline_reason) {
      declineCounts.set(r.decline_reason, (declineCounts.get(r.decline_reason) ?? 0) + 1);
    }
    if (r.accepted_at && r.created_at) {
      const hrs = (new Date(r.accepted_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000;
      if (Number.isFinite(hrs) && hrs >= 0) acceptanceHours.push(hrs);
    }

    const fid = leadFacilityMap.get(r.lead_id);
    if (fid) {
      const fname = facilityNames.get(fid) ?? "Facility";
      if (r.readiness_status === "accepted") {
        const cur = facilityAccepted.get(fid) ?? { name: fname, count: 0 };
        facilityAccepted.set(fid, { name: fname, count: cur.count + 1 });
      }
      if (["needs_info", "needs_review", "cannot_accept"].includes(r.readiness_status)) {
        const cur = facilityIncomplete.get(fid) ?? { name: fname, count: 0 };
        facilityIncomplete.set(fid, { name: fname, count: cur.count + 1 });
      }
    }
  }

  const sortCounts = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([item, count]) => ({ item, count }));

  const sortFacilities = (m: Map<string, { name: string; count: number }>) =>
    [...m.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([facilityId, v]) => ({ facilityId, facilityName: v.name, count: v.count }));

  return {
    newReferrals: leadIds.length,
    readyReferrals,
    needsInfo,
    needsPayerReview,
    needsClinicalReview,
    accepted,
    declined,
    averageReadinessScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    averageHoursToAcceptance:
      acceptanceHours.length > 0
        ? Math.round((acceptanceHours.reduce((a, b) => a + b, 0) / acceptanceHours.length) * 10) / 10
        : null,
    topMissingItems: sortCounts(missingCounts).map(({ item, count }) => ({ item, count })),
    topDeclineReasons: sortCounts(declineCounts).map(({ item, count }) => ({ reason: item, count })),
    byFacilityAccepted: sortFacilities(facilityAccepted),
    byFacilityIncomplete: sortFacilities(facilityIncomplete),
  };
}
