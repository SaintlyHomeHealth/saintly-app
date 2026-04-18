/**
 * Supabase Realtime subscription for `call_sessions` (mobile / multi-device ringing).
 *
 * Usage (React Native or any JS client with `@supabase/supabase-js`):
 *
 * 1. User signs in with the same Supabase session as the web app (or custom JWT).
 * 2. Subscribe to `postgres_changes` on `public.call_sessions` with filter `user_id=eq.<auth user id>`.
 * 3. On INSERT or UPDATE: if `status` is no longer `ringing`, stop audio + dismiss CallKit / connection UI.
 *
 * @example
 * ```ts
 * const channel = supabase
 *   .channel(`call_sessions:${userId}`)
 *   .on(
 *     "postgres_changes",
 *     { event: "*", schema: "public", table: "call_sessions", filter: `user_id=eq.${userId}` },
 *     (payload) => {
 *       const row = payload.new as CallSessionRow;
 *       if (row.status !== "ringing") stopRingingUi(row);
 *     }
 *   )
 *   .subscribe();
 * ```
 */

export type CallSessionRow = {
  id: string;
  user_id: string;
  call_sid: string;
  phone_call_id: string | null;
  status: "ringing" | "answered" | "declined" | "missed" | "ended";
  started_at: string;
  ring_expires_at: string;
  answered_at: string | null;
  ended_at: string | null;
  answered_by_device_id: string | null;
  from_e164: string | null;
  to_e164: string | null;
  created_at: string;
  updated_at: string;
};

/** Push payload fields aligned with `notifyInboundCallStaffPush` + FCM `data`. */
export type IncomingCallPushData = {
  type: "incoming_call";
  phone_call_id: string;
  call_sid: string;
  call_session_id: string;
  open_path: string;
  from_e164: string;
  caller_name?: string;
  caller_name_source?: "internal" | "lookup" | "number_only";
  formatted_from?: string;
  lead_id?: string;
  contact_id?: string;
  conversation_id?: string;
};
