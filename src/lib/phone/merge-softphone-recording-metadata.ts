import type { SupabaseClient } from "@supabase/supabase-js";

import type { SoftphoneRecordingMeta } from "@/lib/twilio/softphone-recording-types";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/**
 * Merges `softphone_recording` under `phone_calls.metadata` for the row keyed by `external_call_id` (Client CallSid).
 */
export async function mergeSoftphoneRecordingMetadata(
  supabase: SupabaseClient,
  externalCallId: string,
  patch: Partial<SoftphoneRecordingMeta>
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
  const prev = asRecord(meta.softphone_recording) as SoftphoneRecordingMeta;

  const next: SoftphoneRecordingMeta = {
    recording_sid: typeof prev.recording_sid === "string" ? prev.recording_sid : null,
    source:
      prev.source === "conference" || prev.source === "pstn_leg" || prev.source === "client_leg"
        ? prev.source
        : null,
    status:
      prev.status === "idle" ||
      prev.status === "in-progress" ||
      prev.status === "stopped" ||
      prev.status === "failed"
        ? prev.status
        : "idle",
    started_at: typeof prev.started_at === "string" ? prev.started_at : null,
    stopped_at: typeof prev.stopped_at === "string" ? prev.stopped_at : null,
    last_error_message: typeof prev.last_error_message === "string" ? prev.last_error_message : null,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  meta.softphone_recording = next as unknown as Record<string, unknown>;

  const { error: upErr } = await supabase.from("phone_calls").update({ metadata: meta }).eq("id", row.id);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}
