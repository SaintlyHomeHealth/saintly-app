import type { SupabaseClient } from "@supabase/supabase-js";

import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/** Normalize webhook/REST patches so we never wipe a known PSTN with empty or junk. */
function sanitizeConferencePatch(patch: Partial<SoftphoneConferenceMeta>): Partial<SoftphoneConferenceMeta> {
  const out: Partial<SoftphoneConferenceMeta> = { ...patch };
  if (out.pstn_call_sid !== undefined) {
    const p = String(out.pstn_call_sid).trim();
    if (!p.startsWith("CA")) {
      delete out.pstn_call_sid;
      if (patch.pstn_call_sid !== undefined && patch.pstn_call_sid !== "") {
        console.log("[merge-softphone-conference-metadata] dropped invalid pstn_call_sid", {
          raw: String(patch.pstn_call_sid).slice(0, 24),
        });
      }
    } else {
      out.pstn_call_sid = p;
    }
  }
  for (const k of Object.keys(out)) {
    const key = k as keyof SoftphoneConferenceMeta;
    if (out[key] === undefined) delete out[key];
  }
  return out;
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
  const patchSafe = sanitizeConferencePatch(patch);

  const next: SoftphoneConferenceMeta = {
    ...prev,
    ...patchSafe,
    updated_at: new Date().toISOString(),
  };
  /** First PSTN leg wins (primary callee); do not replace when 3-way adds another PSTN leg. */
  if (
    prev.pstn_call_sid &&
    patchSafe.pstn_call_sid &&
    patchSafe.pstn_call_sid !== prev.pstn_call_sid
  ) {
    next.pstn_call_sid = prev.pstn_call_sid;
    console.log("[merge-softphone-conference-metadata] kept first pstn_call_sid (3-way / duplicate event)", {
      kept: `${prev.pstn_call_sid.slice(0, 10)}…`,
      ignored: `${patchSafe.pstn_call_sid.slice(0, 10)}…`,
    });
  }
  meta.softphone_conference = next as unknown as Record<string, unknown>;

  const { error: upErr } = await supabase.from("phone_calls").update({ metadata: meta }).eq("id", row.id);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}
