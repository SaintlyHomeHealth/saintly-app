import type { SupabaseClient } from "@supabase/supabase-js";

const DUPLICATE_KEY = "23505";

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === DUPLICATE_KEY) return true;
  return /duplicate key|unique constraint/i.test(error.message || "");
}

/**
 * Inserts one high-priority callback task for an inbound missed call (idempotent via partial unique index).
 */
export async function maybeEnsureAutoMissedCallTask(
  supabase: SupabaseClient,
  phoneCallId: string
): Promise<void> {
  const { data: row, error: selErr } = await supabase
    .from("phone_calls")
    .select("id, assigned_to_user_id, direction")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (selErr) {
    console.warn("[auto_missed_call_task] select phone_calls:", selErr.message);
    return;
  }

  if (!row?.id) {
    return;
  }

  const dir = typeof row.direction === "string" ? row.direction.trim().toLowerCase() : "";
  if (dir !== "inbound") {
    return;
  }

  const assignTo = (row.assigned_to_user_id as string | null | undefined) ?? null;

  const { error } = await supabase.from("phone_call_tasks").insert({
    phone_call_id: phoneCallId,
    title: "Call back caller",
    status: "open",
    priority: "high",
    assigned_to_user_id: assignTo,
    created_by_user_id: null,
    source: "auto_missed_call",
  });

  if (error) {
    if (isUniqueViolation(error)) return;
    console.warn("[auto_missed_call_task] insert:", error.message);
  }
}
