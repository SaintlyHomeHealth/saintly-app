import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAdminRecruitingLeadDetailHref,
  buildAdminRecruitingLeadsListHref,
  type AdminRecruitingLeadsListFilters,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";

function listFilterSuffix(filters: Partial<AdminRecruitingLeadsListFilters>): string {
  return buildAdminRecruitingLeadsListHref(filters).replace("/admin/recruiting", "");
}

export function buildAdminRecruitingCandidateDetailHref(
  candidateId: string,
  filters: Partial<AdminRecruitingLeadsListFilters> = {}
): string {
  const suffix = listFilterSuffix(filters);
  return `/admin/recruiting/${encodeURIComponent(candidateId.trim())}${suffix}`;
}

/** Prefer the full candidate workspace when linked; otherwise the lead detail shell. */
export function buildAdminRecruitingWorkingDetailHref(
  leadId: string,
  candidateId: string | null | undefined,
  filters: Partial<AdminRecruitingLeadsListFilters> = {}
): string {
  const cid = typeof candidateId === "string" ? candidateId.trim() : "";
  if (cid) {
    return buildAdminRecruitingCandidateDetailHref(cid, filters);
  }
  return buildAdminRecruitingLeadDetailHref(leadId, filters);
}

export async function mapRecruitingLeadIdsToCandidateIds(
  supabase: SupabaseClient,
  leadIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return map;

  const { data: candidates, error } = await supabase
    .from("recruiting_candidates")
    .select("id, recruiting_lead_id")
    .in("recruiting_lead_id", ids);

  if (error) {
    console.warn("[recruiting] lead->candidate map:", error.message);
  }

  for (const row of candidates ?? []) {
    const leadId = typeof row.recruiting_lead_id === "string" ? row.recruiting_lead_id.trim() : "";
    const candidateId = typeof row.id === "string" ? row.id.trim() : "";
    if (leadId && candidateId && !map.has(leadId)) {
      map.set(leadId, candidateId);
    }
  }

  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) {
    const { data: docs, error: docErr } = await supabase
      .from("recruiting_lead_resume_documents")
      .select("recruiting_lead_id, recruiting_candidate_id")
      .in("recruiting_lead_id", missing)
      .not("recruiting_candidate_id", "is", null);

    if (docErr) {
      console.warn("[recruiting] lead resume doc candidate map:", docErr.message);
    }

    for (const doc of docs ?? []) {
      const leadId =
        typeof doc.recruiting_lead_id === "string" ? doc.recruiting_lead_id.trim() : "";
      const candidateId =
        typeof doc.recruiting_candidate_id === "string" ? doc.recruiting_candidate_id.trim() : "";
      if (leadId && candidateId && !map.has(leadId)) {
        map.set(leadId, candidateId);
      }
    }
  }

  return map;
}

export async function findRecruitingCandidateIdForLead(
  supabase: SupabaseClient,
  leadId: string
): Promise<string | null> {
  const map = await mapRecruitingLeadIdsToCandidateIds(supabase, [leadId]);
  return map.get(leadId.trim()) ?? null;
}
