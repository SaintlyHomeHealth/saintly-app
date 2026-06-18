import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { syncRecruitingLeadForCandidate } from "@/lib/recruiting/recruiting-lead-candidate-bridge";

/**
 * Links un-synced recruiting_candidates into facebook_recruiting_leads.
 * Run manually via the admin "Sync legacy uploads" button or scripts/backfill-recruiting-lead-candidate-links.ts.
 * Do NOT call during normal page render.
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
