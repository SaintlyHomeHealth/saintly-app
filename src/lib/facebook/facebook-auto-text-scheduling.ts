/**
 * Business hours + duplicate detection for Facebook automated intro SMS (America/Phoenix).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export const FACEBOOK_AUTO_TEXT_TIMEZONE = "America/Phoenix";

/** Inclusive 8:00, exclusive 7:00 PM (19:00) local Phoenix time. */
const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 19 * 60;

type GraphFieldDatum = { name?: string; values?: string[] };

/** Phoenix has no DST — wall time maps to UTC via a fixed +7h offset from local civil time to UTC. */
function phoenixWallTimeToUtcDate(y: number, mo: number, d: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, hour + 7, minute, 0, 0));
}

function addOnePhoenixCalendarDay(y: number, mo: number, d: number): { y: number; mo: number; d: number } {
  const anchor = phoenixWallTimeToUtcDate(y, mo, d, 12, 0);
  const next = new Date(anchor.getTime() + 24 * 60 * 60 * 1000);
  return getPhoenixYmdHms(next);
}

export function getPhoenixYmdHms(d: Date): { y: number; mo: number; d: number; h: number; mi: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: FACEBOOK_AUTO_TEXT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((x) => x.type === t)?.value ?? "0", 10);
  return {
    y: pick("year"),
    mo: pick("month"),
    d: pick("day"),
    h: pick("hour"),
    mi: pick("minute"),
  };
}

export function isWithinFacebookAutoTextBusinessHours(now: Date = new Date()): boolean {
  const { h, mi } = getPhoenixYmdHms(now);
  const mins = h * 60 + mi;
  return mins >= OPEN_MINUTES && mins < CLOSE_MINUTES;
}

/**
 * Next 8:00 AM America/Phoenix for queued sends: today if before 8:00 local, otherwise tomorrow.
 * (Call only when outside the send window; if called during 8–7, returns tomorrow 8:00 as a safe fallback.)
 */
export function nextFacebookAutoTextOpenUtc(from: Date = new Date()): Date {
  const { y, mo, d, h, mi } = getPhoenixYmdHms(from);
  const mins = h * 60 + mi;
  if (mins < OPEN_MINUTES) {
    return phoenixWallTimeToUtcDate(y, mo, d, 8, 0);
  }
  const next = addOnePhoenixCalendarDay(y, mo, d);
  return phoenixWallTimeToUtcDate(next.y, next.mo, next.d, 8, 0);
}

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
