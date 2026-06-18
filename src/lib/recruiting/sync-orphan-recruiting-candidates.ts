import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { syncRecruitingLeadForCandidate } from "@/lib/recruiting/recruiting-lead-candidate-bridge";

/**
 * Gradually links un-synced recruiting candidates into the unified leads table
 * so legacy Indeed/manual records appear in the main Recruiting workspace.
 */
export async function syncOrphanRecruitingCandidatesToLeads(
  supabase: SupabaseClient,
  limit = 40
): Promise<number> {
  const { data, error } = await supabase
    .from("recruiting_candidates")
    .select("id")
    .is("recruiting_lead_id", null)
    .or("recruiting_lead_sync_suppressed.is.null,recruiting_lead_sync_suppressed.eq.false")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.warn("[recruiting] orphan candidate sync list:", error.message);
    return 0;
  }

  let synced = 0;
  for (const row of data ?? []) {
    const id = (row as { id: string }).id;
    const result = await syncRecruitingLeadForCandidate(supabase, id);
    if (result.ok) synced += 1;
  }
  return synced;
}
