import type { SupabaseClient } from "@supabase/supabase-js";

import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";

export type SalesAgentStaffRef = {
  userId: string;
  displayName: string;
};

/** Whether the lead is a sales-agent order (credit is locked on `produced_by_sales_agent_id`). */
export function isSalesAgentProducedLead(input: {
  source?: string | null;
  producedBySalesAgentId?: string | null;
  ownershipLocked?: boolean | null;
}): boolean {
  if (typeof input.producedBySalesAgentId === "string" && input.producedBySalesAgentId.trim()) {
    return true;
  }
  if (input.ownershipLocked === true) return true;
  return (input.source ?? "").trim().toLowerCase() === "sales_agent";
}

export function formatProducedBySalesAgentLabel(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  return t || "Unknown sales agent";
}

/**
 * Resolve producing sales agent display name.
 * `produced_by_sales_agent_id` stores `auth.users.id` / `staff_profiles.user_id` (canonical).
 * Falls back to `staff_profiles.id` when legacy rows stored profile id by mistake.
 */
export async function resolveSalesAgentStaffDisplay(
  supabase: SupabaseClient,
  agentRef: string
): Promise<SalesAgentStaffRef | null> {
  const ref = agentRef.trim();
  if (!ref) return null;

  const select = "user_id, full_name, email, role";

  const { data: byUserId, error: userErr } = await supabase
    .from("staff_profiles")
    .select(select)
    .eq("user_id", ref)
    .maybeSingle();

  if (!userErr && byUserId?.user_id) {
    const userId = String(byUserId.user_id).trim();
    return { userId, displayName: staffPrimaryLabel(byUserId as { user_id: string; full_name: string | null; email: string | null }) };
  }

  const { data: byProfileId, error: profileErr } = await supabase
    .from("staff_profiles")
    .select(select)
    .eq("id", ref)
    .maybeSingle();

  if (!profileErr && byProfileId?.user_id) {
    const userId = String(byProfileId.user_id).trim();
    return { userId, displayName: staffPrimaryLabel(byProfileId as { user_id: string; full_name: string | null; email: string | null }) };
  }

  return null;
}

/** Batch-resolve display names for producing sales agents (`user_id` keys). */
export async function resolveSalesAgentStaffDisplayBatch(
  supabase: SupabaseClient,
  agentRefs: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const refs = [...new Set(agentRefs.map((r) => r.trim()).filter(Boolean))];
  if (refs.length === 0) return out;

  const select = "id, user_id, full_name, email, role";

  const { data: byUserIds } = await supabase.from("staff_profiles").select(select).in("user_id", refs);
  const unresolved = new Set(refs);

  for (const row of byUserIds ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (!uid || !unresolved.has(uid)) continue;
    unresolved.delete(uid);
    out.set(uid, staffPrimaryLabel(row as { user_id: string; full_name: string | null; email: string | null }));
  }

  if (unresolved.size > 0) {
    const { data: byProfileIds } = await supabase
      .from("staff_profiles")
      .select(select)
      .in("id", [...unresolved]);
    for (const row of byProfileIds ?? []) {
      const profileId = typeof row.id === "string" ? row.id.trim() : "";
      const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
      if (!profileId || !uid || !unresolved.has(profileId)) continue;
      unresolved.delete(profileId);
      out.set(profileId, staffPrimaryLabel(row as { user_id: string; full_name: string | null; email: string | null }));
      if (!out.has(uid)) {
        out.set(uid, staffPrimaryLabel(row as { user_id: string; full_name: string | null; email: string | null }));
      }
    }
  }

  return out;
}

/** Recover producing agent user id from the latest sales-agent submission activity. */
export async function resolveProducedBySalesAgentIdFromActivity(
  supabase: SupabaseClient,
  leadId: string
): Promise<string | null> {
  const id = leadId.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from("lead_activities")
    .select("metadata")
    .eq("lead_id", id)
    .eq("event_type", LEAD_ACTIVITY_EVENT.sales_agent_submitted)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.metadata || typeof data.metadata !== "object" || Array.isArray(data.metadata)) {
    return null;
  }

  const meta = data.metadata as Record<string, unknown>;
  const produced =
    typeof meta.produced_by_sales_agent_id === "string" ? meta.produced_by_sales_agent_id.trim() : "";
  return produced || null;
}
