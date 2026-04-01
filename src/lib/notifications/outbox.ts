import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationOutboxStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled"
  | "suppressed";

export type EnqueueNotificationIntentInput = {
  source: string;
  dedupeKey: string;
  status?: NotificationOutboxStatus;
  recipientKind: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientUserId?: string | null;
  payload?: Record<string, unknown>;
  scheduledFor?: string | null;
  notBefore?: string | null;
};

/**
 * Insert a single outbox row. Duplicate dedupe_key is ignored (no error).
 * Use service-role Supabase client so RLS does not block inserts.
 */
export async function enqueueNotificationIntent(
  supabase: SupabaseClient,
  input: EnqueueNotificationIntentInput
): Promise<{ inserted: boolean; id?: string }> {
  const row = {
    source: input.source,
    dedupe_key: input.dedupeKey,
    status: input.status ?? "pending",
    recipient_kind: input.recipientKind,
    recipient_email: input.recipientEmail ?? null,
    recipient_phone: input.recipientPhone ?? null,
    recipient_user_id: input.recipientUserId ?? null,
    payload: input.payload ?? {},
    scheduled_for: input.scheduledFor ?? null,
    not_before: input.notBefore ?? null,
  };

  const { data, error } = await supabase
    .from("notification_outbox")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { inserted: false };
    }
    throw error;
  }

  if (!data?.id) {
    return { inserted: false };
  }

  return { inserted: true, id: data.id };
}
