import type { SupabaseClient } from "@supabase/supabase-js";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

export type PhoneCallRowLookup = {
  id: string;
  /** Canonical row key — parent inbound leg for PSTN→browser; may differ from the Client leg CallSid. */
  external_call_id: string;
  from_e164: string | null;
  metadata: Record<string, unknown>;
  started_at: string | null;
};

/**
 * Resolve `phone_calls` by Twilio CallSid: primary match on `external_call_id`, fallback on
 * `metadata.twilio_leg_map.last_leg_call_sid` (browser/child leg vs parent row).
 */
export async function findPhoneCallRowByTwilioCallSid(
  supabase: SupabaseClient,
  callSid: string
): Promise<PhoneCallRowLookup | null> {
  const sid = callSid.trim();
  if (!sid.startsWith("CA")) return null;

  const { data, error } = await supabase
    .from("phone_calls")
    .select("id, metadata, external_call_id, from_e164, started_at")
    .or(`external_call_id.eq.${sid},metadata->twilio_leg_map->>last_leg_call_sid.eq.${sid}`)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;

  return {
    id: data.id as string,
    external_call_id: typeof data.external_call_id === "string" ? data.external_call_id : sid,
    from_e164: typeof data.from_e164 === "string" ? data.from_e164 : null,
    metadata: asRecord(data.metadata),
    started_at: typeof data.started_at === "string" ? data.started_at : null,
  };
}
