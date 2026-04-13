import type { SupabaseClient } from "@supabase/supabase-js";

import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/**
 * Merges `softphone_conference` under `phone_calls.metadata` for the row keyed by `external_call_id` (Client CallSid).
 */
export async function mergeSoftphoneConferenceMetadata(
  supabase: SupabaseClient,
  externalCallId: string,
  patch: Partial<SoftphoneConferenceMeta>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = externalCallId.trim();
  if (!sid) return { ok: false, error: "missing external_call_id" };

  const { data: row, error: findErr } = await supabase
    .from("phone_calls")
    .select("id, metadata")
    .eq("external_call_id", sid)
    .maybeSingle();

  if (findErr) return { ok: false, error: findErr.message };
  if (!row?.id) return { ok: false, error: "phone_call not found" };

  const meta = asRecord(row.metadata);
  const prev = asRecord(meta.softphone_conference) as SoftphoneConferenceMeta;
  const next: SoftphoneConferenceMeta = {
    ...prev,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  /** First PSTN leg wins (primary callee); do not replace when 3-way adds another PSTN leg. */
  if (
    prev.pstn_call_sid &&
    patch.pstn_call_sid &&
    patch.pstn_call_sid !== prev.pstn_call_sid
  ) {
    next.pstn_call_sid = prev.pstn_call_sid;
  }
  meta.softphone_conference = next as unknown as Record<string, unknown>;

  const { error: upErr } = await supabase.from("phone_calls").update({ metadata: meta }).eq("id", row.id);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}
