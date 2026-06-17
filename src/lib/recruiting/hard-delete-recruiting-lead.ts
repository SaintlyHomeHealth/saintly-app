import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HardDeleteRecruitingLeadResult =
  | { ok: true; leadId: string; suppressedCandidates: number }
  | { ok: false; error: string; status: 400 | 404 | 500 };

/**
 * Permanently delete a unified recruiting lead and related recruiting rows.
 * Linked recruiting_candidates are unlinked and marked sync-suppressed so lazy sync cannot recreate the lead.
 */
export async function hardDeleteRecruitingLead(
  supabase: SupabaseClient,
  leadIdRaw: string
): Promise<HardDeleteRecruitingLeadResult> {
  const leadId = leadIdRaw.trim();
  if (!UUID_RE.test(leadId)) {
    return { ok: false, error: "invalid_lead_id", status: 400 };
  }

  const { data: lead, error: leadErr } = await supabase
    .from("facebook_recruiting_leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) {
    console.warn("[recruiting-leads/delete] load:", leadErr.message);
    return { ok: false, error: leadErr.message, status: 500 };
  }
  if (!lead?.id) {
    return { ok: false, error: "lead_not_found", status: 404 };
  }

  const { data: linkedCandidates, error: candErr } = await supabase
    .from("recruiting_candidates")
    .select("id")
    .eq("recruiting_lead_id", leadId);

  if (candErr) {
    console.warn("[recruiting-leads/delete] linked candidates:", candErr.message);
    return { ok: false, error: candErr.message, status: 500 };
  }

  const candidateIds = (linkedCandidates ?? []).map((r) => String((r as { id: string }).id));

  if (candidateIds.length > 0) {
    const { error: suppressErr } = await supabase
      .from("recruiting_candidates")
      .update({
        recruiting_lead_id: null,
        recruiting_lead_sync_suppressed: true,
      })
      .in("id", candidateIds);

    if (suppressErr) {
      console.warn("[recruiting-leads/delete] suppress candidates:", suppressErr.message);
      return { ok: false, error: suppressErr.message, status: 500 };
    }
  }

  const { error: delErr } = await supabase.from("facebook_recruiting_leads").delete().eq("id", leadId);

  if (delErr) {
    console.warn("[recruiting-leads/delete] lead:", delErr.message);
    return { ok: false, error: delErr.message, status: 500 };
  }

  return { ok: true, leadId, suppressedCandidates: candidateIds.length };
}
