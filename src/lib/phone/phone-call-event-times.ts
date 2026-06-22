import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase/admin";

/** Earliest append-only event time per call (service role; used server-side only). */
export async function loadEarliestPhoneCallEventAtByCallId(
  callIds: string[],
  supabase: SupabaseClient = supabaseAdmin
): Promise<Map<string, string>> {
  const ids = [...new Set(callIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("phone_call_events")
    .select("call_id, created_at")
    .in("call_id", ids);

  if (error) {
    console.warn("[phone-call-event-times] load earliest:", error.message);
    return new Map();
  }

  const out = new Map<string, string>();
  for (const row of data ?? []) {
    const callId = typeof row.call_id === "string" ? row.call_id.trim() : "";
    const createdAt = typeof row.created_at === "string" ? row.created_at.trim() : "";
    if (!callId || !createdAt) continue;
    const prev = out.get(callId);
    if (!prev || new Date(createdAt).getTime() < new Date(prev).getTime()) {
      out.set(callId, createdAt);
    }
  }
  return out;
}
