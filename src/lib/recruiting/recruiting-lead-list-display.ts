import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidFacebookRecruitingLeadStatus } from "@/lib/recruiting/facebook-recruiting-lead-options";
export type RecruitingLeadListCandidateRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  coverage_area: string | null;
  discipline: string | null;
  status: string | null;
  interest_level: string | null;
  last_call_at: string | null;
  last_text_at: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
};

const CANDIDATE_LIST_SELECT =
  "id, full_name, phone, email, city, state, coverage_area, discipline, status, interest_level, last_call_at, last_text_at, last_contact_at, next_follow_up_at";

export type RecruitingLeadListDisplayRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_status: string | null;
  lead_type: string | null;
  visits_per_week: string | null;
  coverage_area: string | null;
  start_date: string | null;
  source: string | null;
  form_name: string | null;
  status: string;
  created_at: string;
};

export async function fetchRecruitingCandidatesForLeadListDisplay(
  supabase: SupabaseClient,
  candidateIds: string[]
): Promise<Map<string, RecruitingLeadListCandidateRow>> {
  const map = new Map<string, RecruitingLeadListCandidateRow>();
  const ids = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from("recruiting_candidates")
    .select(CANDIDATE_LIST_SELECT)
    .in("id", ids);

  if (error) {
    console.warn("[recruiting] list candidate fetch:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    map.set(id, row as RecruitingLeadListCandidateRow);
  }

  return map;
}

function candidateCoverageArea(candidate: RecruitingLeadListCandidateRow): string | null {
  const fromField = candidate.coverage_area?.trim();
  if (fromField) return fromField;
  const fromCityState = [candidate.city?.trim(), candidate.state?.trim()].filter(Boolean).join(", ");
  return fromCityState || null;
}

/**
 * When a lead card resolves to a linked candidate, identity/contact fields come from the candidate.
 * Lead-only index metadata (source, form, dates, visits) stays on the lead row.
 */
export function mergeRecruitingLeadListRowWithCandidate<
  T extends RecruitingLeadListDisplayRow,
>(lead: T, candidate: RecruitingLeadListCandidateRow | null | undefined): T {
  if (!candidate?.id) return lead;

  const fullName = candidate.full_name?.trim();
  const merged: T = {
    ...lead,
    ...(fullName ? { full_name: fullName } : {}),
    ...(candidate.phone?.trim() ? { phone: candidate.phone.trim() } : {}),
    ...(candidate.email?.trim() ? { email: candidate.email.trim() } : {}),
  };

  const coverage = candidateCoverageArea(candidate);
  if (coverage) merged.coverage_area = coverage;

  const discipline = candidate.discipline?.trim();
  if (discipline) merged.license_status = discipline;

  const candidateStatus = candidate.status?.trim();
  if (candidateStatus && isValidFacebookRecruitingLeadStatus(candidateStatus)) {
    merged.status = candidateStatus;
  }

  return merged;
}

export function logRecruitingLeadListCardDisplayDebug(input: {
  leadId: string;
  leadFullName: string;
  candidateId: string | null | undefined;
  candidateFullName: string | null | undefined;
  displayFullName: string;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[recruiting/list-card]", {
    leadId: input.leadId,
    leadFullName: input.leadFullName,
    candidateId: input.candidateId ?? null,
    candidateFullName: input.candidateFullName ?? null,
    displayFullName: input.displayFullName,
  });
}
