/**
 * Duplicate detection helpers for Facebook automated intro SMS.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

type GraphFieldDatum = { name?: string; values?: string[] };

export function fieldMapFromLeadMetadataGraphFieldData(meta: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return m;
  const raw = (meta as Record<string, unknown>).graph_field_data;
  if (!Array.isArray(raw)) return m;
  for (const row of raw) {
    const r = row as GraphFieldDatum;
    const key = typeof r?.name === "string" ? r.name.trim().toLowerCase() : "";
    const vals = Array.isArray(r?.values) ? r.values : [];
    const val = vals
      .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "")))
      .filter(Boolean)
      .join(", ");
    if (key && val) m.set(key, val);
  }
  return m;
}

/**
 * True if this contact/number already has any non-deleted outbound SMS in an active thread
 * (manual or automated) — used to avoid double intro texts.
 */
export async function contactHasPriorOutboundSms(
  supabase: SupabaseClient,
  contactId: string,
  phoneE164: string
): Promise<boolean> {
  const cid = contactId.trim();
  const phone = normalizeDialInputToE164(phoneE164.trim());
  if (!cid || !phone || !isValidE164(phone)) return false;

  const candidates = phoneLookupCandidates(phone);
  const orParts = [`primary_contact_id.eq.${cid}`, ...candidates.map((c) => `main_phone_e164.eq.${c}`)];

  const { data: convs, error: cErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("channel", "sms")
    .is("deleted_at", null)
    .or(orParts.join(","));

  if (cErr) {
    console.warn("[facebook-auto-text] prior outbound lookup conversations:", cErr.message);
    return false;
  }

  const ids = (convs ?? []).map((r) => r.id).filter(Boolean) as string[];
  if (ids.length === 0) return false;

  const { data: msg, error: mErr } = await supabase
    .from("messages")
    .select("id")
    .eq("direction", "outbound")
    .is("deleted_at", null)
    .in("conversation_id", ids)
    .limit(1)
    .maybeSingle();

  if (mErr) {
    console.warn("[facebook-auto-text] prior outbound lookup messages:", mErr.message);
    return false;
  }

  return Boolean(msg?.id);
}
