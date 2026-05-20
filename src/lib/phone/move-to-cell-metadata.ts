import type { SupabaseClient } from "@supabase/supabase-js";

import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import type { MoveToCellMeta, MoveToCellStatus } from "@/lib/phone/move-to-cell-types";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

export async function mergeMoveToCellMetadata(
  supabase: SupabaseClient,
  clientCallSid: string,
  patch: Partial<MoveToCellMeta> & { status?: MoveToCellStatus }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = clientCallSid.trim();
  if (!sid.startsWith("CA")) return { ok: false, error: "invalid client CallSid" };

  const row = await findPhoneCallRowByTwilioCallSid(supabase, sid);
  if (!row?.id) return { ok: false, error: "phone_call not found" };

  const meta = asRecord(row.metadata);
  const prevRaw = meta.move_to_cell;
  const prev =
    prevRaw && typeof prevRaw === "object" && !Array.isArray(prevRaw)
      ? (prevRaw as Record<string, unknown>)
      : {};

  const next: Record<string, unknown> = {
    ...prev,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  meta.move_to_cell = next;

  const { error } = await supabase.from("phone_calls").update({ metadata: meta }).eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
