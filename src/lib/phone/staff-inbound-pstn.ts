import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Staff cell/SMS number from `staff_profiles.sms_notify_phone` for PSTN-first inbound to a DID
 * assigned to that user.
 */
export async function loadStaffSmsNotifyPhoneRawForUserId(
  supabase: SupabaseClient,
  authUserId: string
): Promise<string | null> {
  const uid = authUserId.trim();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("sms_notify_phone")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) {
    console.warn("[staff-inbound-pstn] load sms_notify_phone:", error.message);
    return null;
  }
  const raw = typeof data?.sms_notify_phone === "string" ? data.sms_notify_phone.trim() : "";
  return raw.length > 0 ? raw : null;
}
