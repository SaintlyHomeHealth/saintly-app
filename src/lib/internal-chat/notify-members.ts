import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";

const PUSH_TITLE = "Saintly Chat";
/** HIPAA: no message preview or identifiers in notification surface. */
const PUSH_BODY = "You have a new internal message.";

/**
 * Fan-out FCM to chat members (excluding sender). Respects per-thread mute and staff push preference.
 */
export async function notifyInternalChatRecipients(input: {
  chatId: string;
  senderUserId: string;
}): Promise<void> {
  const { data: members, error: mErr } = await supabaseAdmin
    .from("internal_chat_members")
    .select("user_id, notifications_muted")
    .eq("chat_id", input.chatId)
    .neq("user_id", input.senderUserId);

  if (mErr || !members?.length) {
    return;
  }

  const candidates = members
    .filter((r) => r.notifications_muted !== true)
    .map((r) => String(r.user_id))
    .filter(Boolean);

  if (candidates.length === 0) {
    return;
  }

  const { data: prefs } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, push_notifications_enabled")
    .in("user_id", candidates);

  const allow = new Set(
    (prefs ?? [])
      .filter((p) => p.push_notifications_enabled !== false)
      .map((p) => String(p.user_id))
  );

  const userIds = candidates.filter((id) => allow.has(id));
  if (userIds.length === 0) {
    return;
  }

  await sendFcmDataAndNotificationToUserIds(supabaseAdmin, userIds, {
    title: PUSH_TITLE,
    body: PUSH_BODY,
    data: {
      kind: "internal_chat",
      chatId: input.chatId,
    },
  });
}
