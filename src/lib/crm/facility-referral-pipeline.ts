import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import type {
  FacilityReferralChecklistRow,
  FacilityReferralPipelineCard,
  FacilityReferralPipelineStageKey,
  FacilityReferralPipelineSummary,
  ReferralPipelineHealthRow,
} from "@/lib/crm/facility-referral-pipeline-types";
import { FACILITY_REFERRAL_PIPELINE_STAGES } from "@/lib/crm/facility-referral-pipeline-types";
import {
  isFacilitySourcedLead,
  pipelineStageForLeadStatus,
  referralAgeDays,
  referralUrgency,
} from "@/lib/crm/facility-referral-pipeline-utils";
import { getReferralChecklistForLead } from "@/lib/crm/facility-referral-intake";
import { loadReferralDocumentSummariesByLeadIds } from "@/lib/crm/lead-referral-documents";
import { loadReferralDocumentAiSummariesByLeadIds } from "@/lib/crm/lead-referral-document-ai";
import { loadIntakeReadinessByLeadIds } from "@/lib/crm/lead-intake-readiness";
import { canAccessFacilityFieldTools, isManagerOrHigher, isSalesAgentRole, type StaffProfile } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FacilityReferralPipelineFilters = {
  stage?: FacilityReferralPipelineStageKey | null;
  facility_id?: string | null;
  rep_id?: string | null;
  intake_owner_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  city?: string | null;
  payer?: string | null;
  service_needed?: string | null;
  needs_source_review?: boolean | null;
  has_documents?: boolean | null;
  needs_document_review?: boolean | null;
  no_documents?: boolean | null;
  ai_review_needed?: boolean | null;
  missing_physician_order?: boolean | null;
  missing_insurance?: boolean | null;
  missing_demographics?: boolean | null;
  readiness_status?: string | null;
};

function facilitySourcedOrFilter(): string {
  return "source.eq.facility_outreach,referral_source_type.eq.facility_outreach,referral_source_type.eq.printed_qr,referral_source_type.eq.unmatched_printed_qr,referring_facility_id.not.is.null";
}

async function loadNextOpenTaskForLead(leadId: string): Promise<{ due_at: string; title: string } | null> {
  const { data } = await supabaseAdmin
    .from("crm_tasks")
    .select("title, due_at")
    .eq("related_entity_type", "lead")
    .eq("related_entity_id", leadId)
    .in("status", ["open", "in_progress", "blocked"])
    .not("due_at", "is", null)
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data?.due_at) return null;
  return {
    due_at: String(data.due_at),
    title: typeof data.title === "string" ? data.title : "Task",
  };
}

function lostReasonFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const r = (meta as Record<string, unknown>).lost_reason;
  return typeof r === "string" && r.trim() ? r.trim() : null;
}

function emptySummary(): FacilityReferralPipelineSummary {
  const by_stage = Object.fromEntries(
    FACILITY_REFERRAL_PIPELINE_STAGES.map((s) => [s.key, 0])
  ) as Record<FacilityReferralPipelineStageKey, number>;
  return {
    total: 0,
    by_stage,
    alerts: { unassigned: 0, stuck_3_days: 0, waiting_orders_3_days: 0, overdue_tasks: 0, documents_needing_review: 0, referrals_with_documents: 0, referrals_without_documents: 0 },
  };
}

function buildSummary(referrals: FacilityReferralPipelineCard[]): FacilityReferralPipelineSummary {
  const by_stage = Object.fromEntries(
    FACILITY_REFERRAL_PIPELINE_STAGES.map((s) => [s.key, 0])
  ) as Record<FacilityReferralPipelineStageKey, number>;

  let unassigned = 0;
  let stuck_3_days = 0;
  let waiting_orders_3_days = 0;
  let overdue_tasks = 0;
  let documents_needing_review = 0;
  let referrals_with_documents = 0;
  let referrals_without_documents = 0;

  for (const r of referrals) {
    by_stage[r.pipeline_stage] = (by_stage[r.pipeline_stage] ?? 0) + 1;
    if (!r.intake_owner_id && r.pipeline_stage !== "converted" && r.pipeline_stage !== "lost") unassigned++;
    if (r.referral_age_days >= 3 && r.pipeline_stage !== "converted" && r.pipeline_stage !== "lost") {
      stuck_3_days++;
    }
    if (r.pipeline_stage === "waiting_orders" && r.referral_age_days >= 3) waiting_orders_3_days++;
    if (r.next_task_due) {
      const due = new Date(r.next_task_due).getTime();
      if (!Number.isNaN(due) && due < Date.now()) overdue_tasks++;
    }
    if ((r.documents_needing_review ?? 0) > 0) documents_needing_review++;
    if ((r.document_count ?? 0) > 0) referrals_with_documents++;
    else referrals_without_documents++;
  }

  return {
    total: referrals.length,
    by_stage,
    alerts: {
      unassigned,
      stuck_3_days,
      waiting_orders_3_days,
      overdue_tasks,
      documents_needing_review,
      referrals_with_documents,
      referrals_without_documents,
    },
  };
}

function buildPipelineHealth(referrals: FacilityReferralPipelineCard[]): ReferralPipelineHealthRow[] {
  return FACILITY_REFERRAL_PIPELINE_STAGES.map((stage) => {
    const rows = referrals.filter((r) => r.pipeline_stage === stage.key);
    const ages = rows.map((r) => r.referral_age_days);
    const avg = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
    const oldest = rows.reduce<string | null>((best, r) => {
      const t = r.referral_received_at ?? r.created_at;
      if (!best || t < best) return t;
      return best;
    }, null);

    let action_needed: string | null = null;
    if (stage.key === "new_referral" && rows.some((r) => !r.intake_owner_id)) {
      action_needed = "Assign intake owner";
    } else if (stage.key === "waiting_orders" && rows.some((r) => r.referral_age_days >= 3)) {
      action_needed = "Follow up on orders/F2F";
    } else if (rows.some((r) => r.urgency === "urgent")) {
      action_needed = "Review urgent referrals";
    }

    return {
      stage_key: stage.key,
      stage_label: stage.label,
      count: rows.length,
      average_age_days: avg,
      oldest_referral_at: oldest,
      action_needed,
    };
  });
}

export async function listFacilityReferralPipeline(
  staff: StaffProfile,
  filters: FacilityReferralPipelineFilters
): Promise<{
  referrals: FacilityReferralPipelineCard[];
  summary: FacilityReferralPipelineSummary;
  pipeline_health: ReferralPipelineHealthRow[];
}> {
  if (!canAccessFacilityFieldTools(staff)) {
    return { referrals: [], summary: emptySummary(), pipeline_health: [] };
  }

  const salesRepOnly = isSalesAgentRole(staff) && !isManagerOrHigher(staff);
  const effectiveRepId = salesRepOnly ? staff.user_id : filters.rep_id ?? null;

  let query = leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, status, source, referral_source_type, referring_facility_id, referring_facility_contact_id, produced_by_user_id, assigned_to_staff_id, referral_received_at, referral_attribution_json, created_at, updated_at, service_type, service_disciplines, primary_payer_name, payer_name, needs_referral_source_review, referral_source_match_confidence, contacts ( full_name, primary_phone ), facilities:referring_facility_id ( name, city ), facility_contacts:referring_facility_contact_id ( full_name, first_name, last_name )"
      )
      .or(facilitySourcedOrFilter())
      .order("created_at", { ascending: false })
      .limit(500)
  );

  if (filters.facility_id && UUID_RE.test(filters.facility_id)) {
    query = query.eq("referring_facility_id", filters.facility_id);
  }
  if (filters.rep_id && UUID_RE.test(filters.rep_id)) {
    query = query.eq("produced_by_user_id", filters.rep_id);
  } else if (effectiveRepId && UUID_RE.test(effectiveRepId)) {
    query = query.eq("produced_by_user_id", effectiveRepId);
  }
  if (filters.intake_owner_id && UUID_RE.test(filters.intake_owner_id)) {
    query = query.eq("assigned_to_staff_id", filters.intake_owner_id);
  }
  if (filters.start_date) {
    query = query.gte("created_at", `${filters.start_date.slice(0, 10)}T00:00:00.000Z`);
  }
  if (filters.end_date) {
    query = query.lte("created_at", `${filters.end_date.slice(0, 10)}T23:59:59.999Z`);
  }
  if (filters.payer?.trim()) {
    query = query.or(`primary_payer_name.ilike.%${filters.payer.trim()}%,payer_name.ilike.%${filters.payer.trim()}%`);
  }
  if (filters.service_needed?.trim()) {
    query = query.ilike("service_type", `%${filters.service_needed.trim()}%`);
  }

  if (filters.needs_source_review === true) {
    query = query.or("needs_referral_source_review.eq.true,referral_source_type.eq.unmatched_printed_qr");
  }

  const { data: rows, error } = await query;
  if (error) {
    console.warn("[facility-referral-pipeline] list:", error.message);
    return { referrals: [], summary: emptySummary(), pipeline_health: [] };
  }

  const { data: staffRows } = await supabaseAdmin.from("staff_profiles").select("user_id, full_name, email");
  const staffById = new Map<string, { full_name: string | null; email: string | null }>();
  for (const s of staffRows ?? []) {
    const row = s as { user_id: string; full_name: string | null; email: string | null };
    staffById.set(row.user_id, { full_name: row.full_name, email: row.email });
  }

  const referrals: FacilityReferralPipelineCard[] = [];

  for (const row of rows ?? []) {
    if (!isFacilitySourcedLead(row as Record<string, unknown>)) continue;

    const facility = row.facilities as { name?: string; city?: string } | { name?: string; city?: string }[] | null;
    const f = Array.isArray(facility) ? facility[0] : facility;
    if (filters.city?.trim() && (f?.city ?? "").trim().toLowerCase() !== filters.city.trim().toLowerCase()) {
      continue;
    }

    const cr = row.contacts as { full_name?: string; primary_phone?: string } | { full_name?: string; primary_phone?: string }[] | null;
    const c = Array.isArray(cr) ? cr[0] : cr;
    const fc = row.facility_contacts as
      | { full_name?: string; first_name?: string; last_name?: string }
      | { full_name?: string; first_name?: string; last_name?: string }[]
      | null;
    const contact = Array.isArray(fc) ? fc[0] : fc;
    const contactName =
      (contact?.full_name ?? "").trim() ||
      [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() ||
      null;

    const status = typeof row.status === "string" ? row.status : "new";
    const stage = pipelineStageForLeadStatus(status);
    if (filters.stage && stage.key !== filters.stage) continue;

    const createdAt = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
    const refAt =
      (typeof row.referral_received_at === "string" ? row.referral_received_at : null) ?? createdAt;
    const ageDays = referralAgeDays(refAt);

    const intakeOwnerId =
      typeof row.assigned_to_staff_id === "string" && row.assigned_to_staff_id
        ? row.assigned_to_staff_id
        : null;
    const repId = typeof row.produced_by_user_id === "string" ? row.produced_by_user_id : null;

    const leadId = String(row.id);
    const nextTask = await loadNextOpenTaskForLead(leadId);
    const checklist = await getReferralChecklistForLead(leadId);

    const discs = Array.isArray(row.service_disciplines) ? row.service_disciplines.join(", ") : null;
    const service = (typeof row.service_type === "string" ? row.service_type : null) ?? discs;

    const attr = row.referral_attribution_json as Record<string, unknown> | null;
    const typedFacilityName =
      typeof attr?.typed_referring_facility_name === "string" ? attr.typed_referring_facility_name.trim() : null;

    referrals.push({
      lead_id: leadId,
      patient_name: (c?.full_name ?? "").trim() || "Prospect",
      phone: (c?.primary_phone ?? "").trim() || null,
      payer:
        (typeof row.primary_payer_name === "string" ? row.primary_payer_name : null) ??
        (typeof row.payer_name === "string" ? row.payer_name : null),
      service_needed: service,
      facility_id: typeof row.referring_facility_id === "string" ? row.referring_facility_id : null,
      facility_name: f?.name ?? typedFacilityName,
      facility_contact_name: contactName,
      sales_rep_id: repId,
      sales_rep_label: staffLabelFromLookup(repId, staffById),
      intake_owner_id: intakeOwnerId,
      intake_owner_label: staffLabelFromLookup(intakeOwnerId, staffById),
      status,
      pipeline_stage: stage.key,
      pipeline_stage_label: stage.label,
      created_at: createdAt,
      updated_at: typeof row.updated_at === "string" ? row.updated_at : createdAt,
      referral_received_at: refAt,
      referral_age_days: ageDays,
      urgency: referralUrgency({
        ageDays,
        pipelineStage: stage.key,
        nextTaskDue: nextTask?.due_at ?? null,
        intakeOwnerId,
      }),
      next_task_due: nextTask?.due_at ?? null,
      next_task_title: nextTask?.title ?? null,
      lost_reason: lostReasonFromMeta(row.referral_attribution_json),
      checklist,
      needs_referral_source_review: Boolean(row.needs_referral_source_review),
      referral_source_type:
        typeof row.referral_source_type === "string" ? row.referral_source_type : null,
      typed_referring_facility_name: typedFacilityName,
      referral_source_match_confidence:
        typeof row.referral_source_match_confidence === "number"
          ? row.referral_source_match_confidence
          : null,
    });
  }

  const docSummaries = await loadReferralDocumentSummariesByLeadIds(referrals.map((r) => r.lead_id));
  const aiSummaries = await loadReferralDocumentAiSummariesByLeadIds(referrals.map((r) => r.lead_id));
  const readinessSummaries = await loadIntakeReadinessByLeadIds(referrals.map((r) => r.lead_id));

  let enriched: FacilityReferralPipelineCard[] = referrals.map((r) => {
    const summary = docSummaries.get(r.lead_id);
    const ai = aiSummaries.get(r.lead_id);
    const readiness = readinessSummaries.get(r.lead_id);
    const document_count = summary?.document_count ?? 0;
    const hasOrder = summary?.has_physician_order ?? false;
    const hasFaceOrDemo = (summary?.has_face_sheet ?? false) || (summary?.has_demographics ?? false);
    const hasInsurance = summary?.has_insurance_card ?? false;
    return {
      ...r,
      document_count,
      documents_needing_review: summary?.needs_review_count ?? 0,
      document_types: summary?.document_types ?? [],
      missing_physician_order: document_count > 0 ? !hasOrder : false,
      missing_face_sheet: document_count > 0 ? !hasFaceOrDemo : false,
      ai_reviewed_count: ai?.ai_reviewed_count ?? 0,
      ai_review_needed_count: ai?.ai_review_needed_count ?? document_count,
      ai_missing_physician_order:
        (ai?.ai_reviewed_count ?? 0) > 0 ? ai?.ai_missing_physician_order ?? false : document_count > 0 && !hasOrder,
      ai_missing_insurance:
        (ai?.ai_reviewed_count ?? 0) > 0 ? ai?.ai_missing_insurance ?? false : document_count > 0 && !hasInsurance,
      ai_missing_demographics:
        (ai?.ai_reviewed_count ?? 0) > 0 ? ai?.ai_missing_demographics ?? false : document_count > 0 && !hasFaceOrDemo,
      readiness_status: readiness?.readiness_status,
      readiness_score: readiness?.readiness_score ?? null,
      readiness_missing_count: readiness?.missing_item_count ?? 0,
      readiness_next_action: readiness?.suggested_next_action ?? null,
    };
  });

  if (filters.has_documents === true) {
    enriched = enriched.filter((r) => (r.document_count ?? 0) > 0);
  }
  if (filters.needs_document_review === true) {
    enriched = enriched.filter((r) => (r.documents_needing_review ?? 0) > 0);
  }
  if (filters.no_documents === true) {
    enriched = enriched.filter((r) => (r.document_count ?? 0) === 0);
  }
  if (filters.ai_review_needed === true) {
    enriched = enriched.filter(
      (r) => (r.document_count ?? 0) > 0 && (r.ai_review_needed_count ?? 0) > 0
    );
  }
  if (filters.missing_physician_order === true) {
    enriched = enriched.filter((r) => r.ai_missing_physician_order || r.missing_physician_order);
  }
  if (filters.missing_insurance === true) {
    enriched = enriched.filter((r) => r.ai_missing_insurance);
  }
  if (filters.missing_demographics === true) {
    enriched = enriched.filter((r) => r.ai_missing_demographics || r.missing_face_sheet);
  }
  if (filters.readiness_status?.trim()) {
    const rs = filters.readiness_status.trim();
    enriched = enriched.filter((r) => r.readiness_status === rs);
  }

  return {
    referrals: enriched,
    summary: buildSummary(enriched),
    pipeline_health: buildPipelineHealth(enriched),
  };
}

export async function loadFacilityReferralPipelineCounts(
  facilityIds: string[]
): Promise<Map<string, { open: number; waiting_orders: number; converted_month: number }>> {
  const out = new Map<string, { open: number; waiting_orders: number; converted_month: number }>();
  if (facilityIds.length === 0) return out;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: rows } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("referring_facility_id, status, created_at, referral_attribution_json")
      .in("referring_facility_id", facilityIds)
      .limit(5000)
  );

  for (const row of rows ?? []) {
    const fid = typeof row.referring_facility_id === "string" ? row.referring_facility_id : "";
    if (!fid) continue;
    const prev = out.get(fid) ?? { open: 0, waiting_orders: 0, converted_month: 0 };
    const st = typeof row.status === "string" ? row.status : "new";
    const stage = pipelineStageForLeadStatus(st);
    if (stage.key !== "converted" && stage.key !== "lost") prev.open++;
    if (stage.key === "waiting_orders") prev.waiting_orders++;
    if (stage.key === "converted") {
      const meta = row.referral_attribution_json as Record<string, unknown> | null;
      const convertedAt =
        (typeof meta?.converted_at === "string" ? meta.converted_at : null) ??
        (typeof row.created_at === "string" ? row.created_at : null);
      if (convertedAt && new Date(convertedAt) >= monthStart) prev.converted_month++;
    }
    out.set(fid, prev);
  }

  return out;
}

export type ReferralPipelineAnalytics = {
  leadsCreated: number;
  contactedCount: number;
  insuranceVerifiedCount: number;
  waitingOrdersCount: number;
  readyForSocCount: number;
  convertedCount: number;
  lostCount: number;
  conversionRate: number | null;
  avgDaysToConversion: number | null;
  referralsWaitingOnOrders: number;
  topFacilitiesConverted: Array<{ facilityId: string; facilityName: string; count: number }>;
  topFacilitiesLost: Array<{ facilityId: string; facilityName: string; count: number }>;
  topRepsConverted: Array<{ repUserId: string; repLabel: string; count: number }>;
  pipelineHealth: ReferralPipelineHealthRow[];
  referralsWithDocuments: number;
  documentsNeedingReview: number;
  averageDocumentsPerReferral: number | null;
  referralsMissingDocuments: number;
  documentsByType: Record<string, number>;
  documentsAiReviewed: number;
  documentsAiReviewNeeded: number;
  referralsMissingPhysicianOrder: number;
  referralsMissingInsurance: number;
  averageAiConfidence: number | null;
};

export function emptyReferralPipelineAnalytics(): ReferralPipelineAnalytics {
  return {
    leadsCreated: 0,
    contactedCount: 0,
    insuranceVerifiedCount: 0,
    waitingOrdersCount: 0,
    readyForSocCount: 0,
    convertedCount: 0,
    lostCount: 0,
    conversionRate: null,
    avgDaysToConversion: null,
    referralsWaitingOnOrders: 0,
    topFacilitiesConverted: [],
    topFacilitiesLost: [],
    topRepsConverted: [],
    pipelineHealth: FACILITY_REFERRAL_PIPELINE_STAGES.map((s) => ({
      stage_key: s.key,
      stage_label: s.label,
      count: 0,
      average_age_days: null,
      oldest_referral_at: null,
      action_needed: null,
    })),
    referralsWithDocuments: 0,
    documentsNeedingReview: 0,
    averageDocumentsPerReferral: null,
    referralsMissingDocuments: 0,
    documentsByType: {},
    documentsAiReviewed: 0,
    documentsAiReviewNeeded: 0,
    referralsMissingPhysicianOrder: 0,
    referralsMissingInsurance: 0,
    averageAiConfidence: null,
  };
}

export function buildReferralPipelineAnalytics(
  referrals: FacilityReferralPipelineCard[],
  pipelineHealth: ReferralPipelineHealthRow[]
): ReferralPipelineAnalytics {
  const base = emptyReferralPipelineAnalytics();
  if (referrals.length === 0) return base;

  let contacted = 0;
  let insuranceVerified = 0;
  const convertedAges: number[] = [];
  const facilityConverted = new Map<string, { name: string; count: number }>();
  const facilityLost = new Map<string, { name: string; count: number }>();
  const repConverted = new Map<string, { label: string; count: number }>();

  for (const r of referrals) {
    if (r.checklist?.patient_contacted) contacted++;
    if (r.checklist?.insurance_verified) insuranceVerified++;

    if (r.pipeline_stage === "converted") {
      convertedAges.push(r.referral_age_days);
      if (r.facility_id) {
        const prev = facilityConverted.get(r.facility_id);
        facilityConverted.set(r.facility_id, {
          name: r.facility_name ?? "Facility",
          count: (prev?.count ?? 0) + 1,
        });
      }
      if (r.sales_rep_id) {
        const prev = repConverted.get(r.sales_rep_id);
        repConverted.set(r.sales_rep_id, {
          label: r.sales_rep_label ?? "Rep",
          count: (prev?.count ?? 0) + 1,
        });
      }
    }
    if (r.pipeline_stage === "lost" && r.facility_id) {
      const prev = facilityLost.get(r.facility_id);
      facilityLost.set(r.facility_id, {
        name: r.facility_name ?? "Facility",
        count: (prev?.count ?? 0) + 1,
      });
    }
  }

  const convertedCount = referrals.filter((r) => r.pipeline_stage === "converted").length;
  const lostCount = referrals.filter((r) => r.pipeline_stage === "lost").length;
  const waitingOrders = referrals.filter((r) => r.pipeline_stage === "waiting_orders").length;

  const sortTopFacilities = (entries: Array<[string, { name: string; count: number }]>) =>
    entries
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([id, v]) => ({ facilityId: id, facilityName: v.name, count: v.count }));

  const sortTopReps = (entries: Array<[string, { label: string; count: number }]>) =>
    entries
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([id, v]) => ({ repUserId: id, repLabel: v.label, count: v.count }));

  let referralsWithDocuments = 0;
  let documentsNeedingReview = 0;
  let totalDocumentCount = 0;
  let documentsAiReviewed = 0;
  let documentsAiReviewNeeded = 0;
  let referralsMissingPhysicianOrder = 0;
  let referralsMissingInsurance = 0;
  const documentsByType: Record<string, number> = {};

  for (const r of referrals) {
    const count = r.document_count ?? 0;
    if (count > 0) {
      referralsWithDocuments++;
      totalDocumentCount += count;
    }
    documentsNeedingReview += r.documents_needing_review ?? 0;
    documentsAiReviewed += r.ai_reviewed_count ?? 0;
    if ((r.document_count ?? 0) > 0 && (r.ai_review_needed_count ?? 0) > 0) documentsAiReviewNeeded++;
    if (r.ai_missing_physician_order || r.missing_physician_order) referralsMissingPhysicianOrder++;
    if (r.ai_missing_insurance) referralsMissingInsurance++;
    for (const t of r.document_types ?? []) {
      documentsByType[t] = (documentsByType[t] ?? 0) + 1;
    }
  }

  return {
    leadsCreated: referrals.length,
    contactedCount: contacted,
    insuranceVerifiedCount: insuranceVerified,
    waitingOrdersCount: waitingOrders,
    readyForSocCount: referrals.filter((r) => r.pipeline_stage === "ready_soc").length,
    convertedCount,
    lostCount,
    conversionRate:
      referrals.length > 0 ? Math.round((convertedCount / referrals.length) * 1000) / 10 : null,
    avgDaysToConversion:
      convertedAges.length > 0
        ? Math.round(convertedAges.reduce((a, b) => a + b, 0) / convertedAges.length)
        : null,
    referralsWaitingOnOrders: waitingOrders,
    topFacilitiesConverted: sortTopFacilities([...facilityConverted.entries()]),
    topFacilitiesLost: sortTopFacilities([...facilityLost.entries()]),
    topRepsConverted: sortTopReps([...repConverted.entries()]),
    pipelineHealth,
    referralsWithDocuments,
    documentsNeedingReview,
    averageDocumentsPerReferral:
      referralsWithDocuments > 0
        ? Math.round((totalDocumentCount / referralsWithDocuments) * 10) / 10
        : null,
    referralsMissingDocuments: referrals.length - referralsWithDocuments,
    documentsByType,
    documentsAiReviewed,
    documentsAiReviewNeeded,
    referralsMissingPhysicianOrder,
    referralsMissingInsurance,
    averageAiConfidence: null,
  };
}

export type FacilityReferralLeadPanelData = {
  facility_id: string;
  facility_name: string;
  facility_contact_name: string | null;
  activity_id: string | null;
  activity_summary: string | null;
  sales_rep_label: string | null;
  referral_received_at: string | null;
  pipeline_stage_label: string;
  checklist: FacilityReferralChecklistRow | null;
};

export async function loadFacilityReferralLeadPanel(leadId: string): Promise<FacilityReferralLeadPanelData | null> {
  if (!UUID_RE.test(leadId)) return null;

  const { data: lead } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, source, referral_source_type, referring_facility_id, referring_facility_contact_id, referring_facility_activity_id, produced_by_user_id, referral_received_at, status, facilities:referring_facility_id ( name ), facility_contacts:referring_facility_contact_id ( full_name, first_name, last_name )"
      )
      .eq("id", leadId)
  ).maybeSingle();

  if (!lead?.id || !isFacilitySourcedLead(lead as Record<string, unknown>)) return null;

  const facilityId = typeof lead.referring_facility_id === "string" ? lead.referring_facility_id : null;
  if (!facilityId) return null;

  const f = lead.facilities as { name?: string } | { name?: string }[] | null;
  const facility = Array.isArray(f) ? f[0] : f;
  const fc = lead.facility_contacts as
    | { full_name?: string; first_name?: string; last_name?: string }
    | { full_name?: string; first_name?: string; last_name?: string }[]
    | null;
  const contact = Array.isArray(fc) ? fc[0] : fc;
  const contactName =
    (contact?.full_name ?? "").trim() ||
    [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() ||
    null;

  const repId = typeof lead.produced_by_user_id === "string" ? lead.produced_by_user_id : null;
  let salesRepLabel: string | null = null;
  if (repId) {
    const { data: rep } = await supabaseAdmin
      .from("staff_profiles")
      .select("full_name, email")
      .eq("user_id", repId)
      .maybeSingle();
    salesRepLabel = staffLabelFromLookup(
      repId,
      rep ? { [repId]: { full_name: rep.full_name ?? null, email: rep.email ?? null } } : {}
    );
  }

  const activityId =
    typeof lead.referring_facility_activity_id === "string" ? lead.referring_facility_activity_id : null;
  let activitySummary: string | null = null;
  if (activityId) {
    const { data: act } = await supabaseAdmin
      .from("facility_activities")
      .select("activity_type, outcome, notes")
      .eq("id", activityId)
      .maybeSingle();
    if (act) {
      activitySummary = [act.activity_type, act.outcome].filter(Boolean).join(" · ");
      const note = typeof act.notes === "string" ? act.notes.trim() : "";
      if (note) activitySummary += ` — ${note.slice(0, 120)}`;
    }
  }

  const stage = pipelineStageForLeadStatus(typeof lead.status === "string" ? lead.status : "new");
  const checklist = await getReferralChecklistForLead(leadId);

  return {
    facility_id: facilityId,
    facility_name: facility?.name ?? "Facility",
    facility_contact_name: contactName,
    activity_id: activityId,
    activity_summary: activitySummary,
    sales_rep_label: salesRepLabel,
    referral_received_at:
      typeof lead.referral_received_at === "string" ? lead.referral_received_at : null,
    pipeline_stage_label: stage.label,
    checklist,
  };
}
