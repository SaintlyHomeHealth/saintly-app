import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility } from "@/lib/staff-profile";

/**
 * Server-side gate aligned with SMS conversation RLS: full visibility, assigned owner,
 * or at least one visible SMS row owned by this staff member.
 */
export async function staffMayAccessSmsConversation (
  supabase: SupabaseClient,
  staff: StaffProfile,
  conversationId: string,
  row: { assigned_to_user_id: string | null }
): Promise<boolean> {
  if (hasFullCallVisibility(staff)) return true;
  const assigned =
    row.assigned_to_user_id != null && String(row.assigned_to_user_id).trim() !== ""
      ? String(row.assigned_to_user_id)
      : null;
  if (assigned === staff.user_id) return true;

  const cid = conversationId.trim();
  if (!cid) return false;

  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", cid)
    .eq("owner_user_id", staff.user_id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[staff-sms-access] owner probe:", error.message);
    return false;
  }
  return Boolean(data?.id);
}
