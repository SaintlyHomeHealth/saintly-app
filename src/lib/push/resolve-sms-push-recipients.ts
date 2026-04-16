import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveInboundBrowserStaffUserIdsAsync } from "@/lib/softphone/inbound-staff-ids";

/**
 * Who receives an inbound SMS push: assigned conversation owner first, else the same
 * inbound ring audience as softphone (env + eligible staff_profiles).
 */
export async function resolveSmsPushRecipientUserIds(
  supabase: SupabaseClient,
  conversationId: string
): Promise<string[]> {
  const id = conversationId.trim();
  if (!id) return [];

  const { data: conv, error } = await supabase
    .from("conversations")
    .select("assigned_to_user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn("[push] resolveSmsPushRecipientUserIds read conversation:", error.message);
  }

  const assigned = typeof conv?.assigned_to_user_id === "string" ? conv.assigned_to_user_id.trim() : "";
  if (assigned) {
    console.log("[push] SMS notify recipients: conversation assigned_to_user_id", { conversationId: id, userId: assigned });
    return [assigned];
  }

  const audience = await resolveInboundBrowserStaffUserIdsAsync();
  console.log("[push] SMS notify recipients: inbound ring audience", {
    conversationId: id,
    userIdCount: audience.length,
    userIds: audience,
  });
  return audience;
}
