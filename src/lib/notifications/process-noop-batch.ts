import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

export type NoopProcessOutcome = "sent" | "skipped" | "error";

export type NoopProcessRowResult = {
  id: string;
  outcome: NoopProcessOutcome;
  message?: string;
};

/**
 * Claims pending outbox rows (pending → processing → sent), recording a noop
 * delivery attempt. Uses service-role client; caller must enforce admin auth.
 */
export async function processNoopNotificationBatch(
  supabase: SupabaseClient,
  options?: { limit?: number }
): Promise<{ results: NoopProcessRowResult[] }> {
  const limit = Math.min(
    Math.max(Number(options?.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const { data: pending, error: fetchError } = await supabase
    .from("notification_outbox")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchError) {
    throw fetchError;
  }

  const results: NoopProcessRowResult[] = [];

  for (const row of pending || []) {
    const { data: claimed, error: claimError } = await supabase
      .from("notification_outbox")
      .update({ status: "processing" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError) {
      results.push({
        id: row.id,
        outcome: "error",
        message: claimError.message,
      });
      continue;
    }

    if (!claimed) {
      results.push({
        id: row.id,
        outcome: "skipped",
        message: "Already claimed or not pending",
      });
      continue;
    }

    const { error: attemptError } = await supabase
      .from("notification_delivery_attempt")
      .insert({
        outbox_id: row.id,
        channel: "noop",
        status: "skipped",
        metadata: {
          processor: "noop_batch",
          note: "No external provider; lifecycle test only",
        },
      });

    if (attemptError) {
      await supabase
        .from("notification_outbox")
        .update({ status: "failed" })
        .eq("id", row.id);
      results.push({
        id: row.id,
        outcome: "error",
        message: attemptError.message,
      });
      continue;
    }

    const { data: finalized, error: finalizeError } = await supabase
      .from("notification_outbox")
      .update({ status: "sent" })
      .eq("id", row.id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();

    if (finalizeError || !finalized) {
      await supabase
        .from("notification_outbox")
        .update({ status: "failed" })
        .eq("id", row.id);
      results.push({
        id: row.id,
        outcome: "error",
        message: finalizeError?.message || "Finalize did not update row",
      });
      continue;
    }

    results.push({ id: row.id, outcome: "sent" });
  }

  return { results };
}

export { DEFAULT_LIMIT as NOOP_BATCH_DEFAULT_LIMIT, MAX_LIMIT as NOOP_BATCH_MAX_LIMIT };
