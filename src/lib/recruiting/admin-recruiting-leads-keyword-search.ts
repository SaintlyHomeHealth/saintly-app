import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ADMIN_RECRUITING_LEADS_KEYWORD_ID_BUCKET_CAP,
  buildRecruitingCandidateKeywordOrClause,
  buildRecruitingLeadKeywordSearchOrClause,
  escapedRecruitingLeadSearchTerms,
} from "@/lib/recruiting/admin-recruiting-leads-keyword-search-clauses";

async function resolveLinkedLeadIdsFromCandidateKeyword(
  supabase: SupabaseClient,
  escapedTerms: readonly string[],
  qRaw: string
): Promise<string[]> {
  const orClause = buildRecruitingCandidateKeywordOrClause(escapedTerms, qRaw);
  if (!orClause) return [];

  const { data, error } = await supabase
    .from("recruiting_candidates")
    .select("id, recruiting_lead_id")
    .or(orClause)
    .limit(ADMIN_RECRUITING_LEADS_KEYWORD_ID_BUCKET_CAP);

  if (error) {
    console.warn("[recruiting] keyword search candidates:", error.message);
    return [];
  }

  const leadIds = new Set<string>();
  const candidateIdsNeedingDocLookup: string[] = [];

  for (const row of data ?? []) {
    const leadId =
      typeof row.recruiting_lead_id === "string" ? row.recruiting_lead_id.trim() : "";
    const candidateId = typeof row.id === "string" ? row.id.trim() : "";
    if (leadId) {
      leadIds.add(leadId);
    } else if (candidateId) {
      candidateIdsNeedingDocLookup.push(candidateId);
    }
  }

  if (candidateIdsNeedingDocLookup.length > 0) {
    const { data: docs, error: docErr } = await supabase
      .from("recruiting_lead_resume_documents")
      .select("recruiting_lead_id")
      .in("recruiting_candidate_id", candidateIdsNeedingDocLookup)
      .not("recruiting_lead_id", "is", null)
      .limit(ADMIN_RECRUITING_LEADS_KEYWORD_ID_BUCKET_CAP);

    if (docErr) {
      console.warn("[recruiting] keyword search resume doc leads:", docErr.message);
    } else {
      for (const doc of docs ?? []) {
        const leadId =
          typeof doc.recruiting_lead_id === "string" ? doc.recruiting_lead_id.trim() : "";
        if (leadId) leadIds.add(leadId);
      }
    }
  }

  return [...leadIds].slice(0, ADMIN_RECRUITING_LEADS_KEYWORD_ID_BUCKET_CAP);
}

export async function resolveAdminRecruitingLeadsKeywordSearchOr(
  supabase: SupabaseClient,
  qRaw: string
): Promise<string | null> {
  const trimmed = qRaw.trim().slice(0, 120);
  const escapedTerms = escapedRecruitingLeadSearchTerms(trimmed);
  if (escapedTerms.length === 0) return null;

  const linkedLeadIds = await resolveLinkedLeadIdsFromCandidateKeyword(
    supabase,
    escapedTerms,
    trimmed
  );

  const orClause = buildRecruitingLeadKeywordSearchOrClause({
    escapedTerms,
    qRaw: trimmed,
    linkedLeadIds,
  });

  return orClause?.trim() ? orClause : null;
}
