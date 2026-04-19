import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

export type UserPushDevicePlatform = "ios" | "android";

/**
 * Persists SMS/in-app FCM routing for one physical app install.
 * Conflict key is (user_id, device_install_id) so token refresh replaces the same row.
 */
export async function upsertUserPushDeviceByInstallId(
  supabase: SupabaseClient,
  input: {
    userId: string;
    fcmToken: string;
    deviceInstallId: string;
    /** Workspace mobile alerts use APNs when `ios`. */
    platform: UserPushDevicePlatform;
    updatedAtIso: string;
  }
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("user_push_devices").upsert(
    {
      user_id: input.userId,
      platform: input.platform,
      fcm_token: input.fcmToken.trim(),
      device_install_id: input.deviceInstallId.trim(),
      updated_at: input.updatedAtIso,
    },
    { onConflict: "user_id,device_install_id" }
  );
  return { error };
}
