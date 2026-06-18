import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isRecruitingOutreachAttemptActivity,
  type RecruitingLeadListEngagementCandidateRow,
  type RecruitingLeadListEngagementSummary,
} from "@/lib/recruiting/recruiting-lead-list-engagement";

const OUTBOUND_EMAIL_EVENT = "outbound_email";

export async function fetchRecruitingLeadListEngagementSummaries(input: {
  supabase: SupabaseClient;
  leadRows: { id: string; status: string }[];
  candidateByLeadId: Map<string, string>;
  candidateById: Map<string, RecruitingLeadListEngagementCandidateRow>;
}): Promise<Map<string, RecruitingLeadListEngagementSummary>> {
  const map = new Map<string, RecruitingLeadListEngagementSummary>();
  const { supabase, leadRows, candidateByLeadId, candidateById } = input;

  const candidateIds = [...new Set([...candidateByLeadId.values()])];
  const leadIds = leadRows.map((r) => r.id);

  const [attemptRows, emailActivityRows, leadEmailRows] = await Promise.all([
    fetchAttemptCountsByCandidateId(supabase, candidateIds),
    fetchLastEmailByCandidateId(supabase, candidateIds),
    fetchLastLeadEmailByLeadId(supabase, leadIds),
  ]);

  for (const lead of leadRows) {
    const candidateId = candidateByLeadId.get(lead.id);
    const candidate = candidateId ? candidateById.get(candidateId) : undefined;

    if (candidate?.id) {
      const candidateEmailAt = emailActivityRows.get(candidate.id) ?? null;
      const leadEmailAt = leadEmailRows.get(lead.id) ?? null;
      const lastEmailAt = maxIso(candidateEmailAt, leadEmailAt);

      map.set(lead.id, {
        attemptsCount: attemptRows.get(candidate.id) ?? 0,
        lastContactAt: candidate.last_contact_at ?? null,
        lastCallAt: candidate.last_call_at ?? null,
        lastTextAt: candidate.last_text_at ?? null,
        lastEmailAt,
        nextFollowUpAt: candidate.next_follow_up_at ?? null,
        status: candidate.status?.trim() || lead.status,
        interestLevel: candidate.interest_level?.trim() || null,
        usesCandidateEngagement: true,
      });
      continue;
    }

    const leadEmailAt = leadEmailRows.get(lead.id) ?? null;
    map.set(lead.id, {
      attemptsCount: leadEmailAt ? 1 : 0,
      lastContactAt: leadEmailAt,
      lastCallAt: null,
      lastTextAt: null,
      lastEmailAt: leadEmailAt,
      nextFollowUpAt: null,
      status: lead.status,
      interestLevel: null,
      usesCandidateEngagement: false,
    });
  }

  return map;
}

async function fetchAttemptCountsByCandidateId(
  supabase: SupabaseClient,
  candidateIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from("recruiting_candidate_activities")
    .select("candidate_id, activity_type, outcome")
    .in("candidate_id", ids);

  if (error) {
    console.warn("[recruiting] list attempt counts:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const candidateId = typeof row.candidate_id === "string" ? row.candidate_id.trim() : "";
    if (!candidateId) continue;
    if (
      !isRecruitingOutreachAttemptActivity({
        activity_type: String(row.activity_type ?? ""),
        outcome: typeof row.outcome === "string" ? row.outcome : null,
      })
    ) {
      continue;
    }
    map.set(candidateId, (map.get(candidateId) ?? 0) + 1);
  }

  return map;
}

async function fetchLastEmailByCandidateId(
  supabase: SupabaseClient,
  candidateIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from("recruiting_candidate_activities")
    .select("candidate_id, created_at")
    .in("candidate_id", ids)
    .eq("activity_type", "email")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[recruiting] list candidate email activities:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const candidateId = typeof row.candidate_id === "string" ? row.candidate_id.trim() : "";
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";
    if (candidateId && createdAt && !map.has(candidateId)) {
      map.set(candidateId, createdAt);
    }
  }

  return map;
}

async function fetchLastLeadEmailByLeadId(
  supabase: SupabaseClient,
  leadIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return map;

  const { data, error } = await supabase
    .from("facebook_recruiting_lead_activities")
    .select("lead_id, created_at")
    .in("lead_id", ids)
    .eq("event_type", OUTBOUND_EMAIL_EVENT)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[recruiting] list lead email activities:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const leadId = typeof row.lead_id === "string" ? row.lead_id.trim() : "";
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";
    if (leadId && createdAt && !map.has(leadId)) {
      map.set(leadId, createdAt);
    }
  }

  return map;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}
