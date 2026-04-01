import { supabaseAdmin } from "@/lib/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseStaffUserUuid(raw: string): string | null {
  const t = raw.trim();
  if (!t || !UUID_RE.test(t)) return null;
  return t.toLowerCase();
}

/**
 * Supabase auth `user_id`s for browser softphones to ring on inbound (before PSTN fallback).
 *
 * Reads from `TWILIO_VOICE_INBOUND_STAFF_USER_IDS` and `TWILIO_VOICE_INBOUND_STAFF_USER_ID`, merges
 * unique UUIDs in order (IDs list first, then single ID). Values are comma / semicolon / whitespace separated.
 *
 * TwiML: one &lt;Dial&gt; with multiple &lt;Client&gt; nouns — Twilio rings them **simultaneously**;
 * **first to answer** is bridged to the caller (Programmable Voice behavior).
 */
export function resolveInboundBrowserStaffUserIds(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const sources = [
    process.env.TWILIO_VOICE_INBOUND_STAFF_USER_IDS?.trim() ?? "",
    process.env.TWILIO_VOICE_INBOUND_STAFF_USER_ID?.trim() ?? "",
  ];

  for (const combined of sources) {
    if (!combined) continue;
    for (const part of combined.split(/[,;\s]+/)) {
      const id = parseStaffUserUuid(part);
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }

  return out;
}

function mergeUniqueOrdered(first: string[], second: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...first, ...second]) {
    const k = id.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(id);
    }
  }
  return out;
}

/**
 * Env-configured inbound ring IDs plus `staff_profiles` rows with `inbound_ring_enabled`
 * (active, with login, phone access on). Order: env first, then DB.
 */
export async function resolveInboundBrowserStaffUserIdsAsync(): Promise<string[]> {
  const envIds = resolveInboundBrowserStaffUserIds();
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id")
    .eq("inbound_ring_enabled", true)
    .eq("phone_access_enabled", true)
    .eq("is_active", true)
    .not("user_id", "is", null);

  if (error) {
    console.warn("[inbound-staff-ids] resolveInboundBrowserStaffUserIdsAsync:", error.message);
    return envIds;
  }

  const dbIds = (data ?? [])
    .map((r) => (typeof r.user_id === "string" ? r.user_id : null))
    .filter((id): id is string => Boolean(id && parseStaffUserUuid(id)));
  return mergeUniqueOrdered(envIds, dbIds);
}

const DEFAULT_BROWSER_RING_SECONDS = 20;
const MIN_BROWSER_RING_SECONDS = 8;
const MAX_BROWSER_RING_SECONDS = 45;

export function resolveBrowserFirstRingTimeoutSeconds(): number {
  const raw = process.env.TWILIO_VOICE_BROWSER_RING_SECONDS?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_BROWSER_RING_SECONDS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_BROWSER_RING_SECONDS;
  return Math.min(
    MAX_BROWSER_RING_SECONDS,
    Math.max(MIN_BROWSER_RING_SECONDS, n)
  );
}
