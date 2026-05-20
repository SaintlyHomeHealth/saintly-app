import type { SupabaseClient } from "@supabase/supabase-js";

import { appendPhoneCallEventByExternalId } from "@/lib/phone/log-call";
import type { MoveToCellEventType } from "@/lib/phone/move-to-cell-types";

const LOG_TAG = "move-to-cell";

export async function logMoveToCellEvent(
  supabase: SupabaseClient,
  clientCallSid: string,
  eventType: MoveToCellEventType,
  payload: Record<string, unknown> = {}
): Promise<void> {
  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: eventType,
      client_call_sid: clientCallSid,
      ...payload,
    })
  );
  const result = await appendPhoneCallEventByExternalId(supabase, clientCallSid, eventType, {
    source: "move_to_cell",
    ...payload,
  });
  if (!result.ok) {
    console.warn(`[${LOG_TAG}] append_event_failed`, result.error);
  }
}
