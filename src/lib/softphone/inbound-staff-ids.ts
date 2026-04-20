import { unstable_cache } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { matchesSoftphoneTokenEligibilityForInboundRing, type StaffProfile } from "@/lib/staff-profile";

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
 * Each value must be a UUID. Prefer **`auth.users.id`** (same as **`staff_profiles.user_id`**). If you pass
 * **`staff_profiles.id`** by mistake, {@link canonicalizeInboundEnvIdsToAuthUserIds} maps it to `user_id` in the async path.
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

function mapRowsToCanonicalAuthUserIds(
  envIds: string[],
  rows: { id: string; user_id: string | null }[] | null
): string[] {
  const matchedAsAuthUserId = new Set(
    (rows ?? [])
      .map((r) => r.user_id)
      .filter((id): id is string => typeof id === "string" && envIds.includes(id))
  );
  const profilePkToUserId = new Map(
    (rows ?? [])
      .filter((r): r is { id: string; user_id: string } => typeof r.user_id === "string" && Boolean(r.id))
      .map((r) => [r.id, r.user_id] as const)
  );

  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of envIds) {
    let canonical: string;
    if (matchedAsAuthUserId.has(e)) {
      canonical = e;
    } else {
      const fromPk = profilePkToUserId.get(e);
      canonical = fromPk ?? e;
    }
    const u = parseStaffUserUuid(canonical);
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

/**
 * Maps env list entries to `staff_profiles.user_id` (auth UUID). Accepts either `user_id` or `staff_profiles.id`.
 * Uses one round trip when possible (user_id OR id match); falls back to two queries if PostgREST rejects the filter.
 */
export async function canonicalizeInboundEnvIdsToAuthUserIds(envIds: string[]): Promise<string[]> {
  if (envIds.length === 0) return [];

  const inList = envIds.join(",");
  const { data: mergedRows, error: mergedError } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id")
    .or(`user_id.in.(${inList}),id.in.(${inList})`);

  if (!mergedError && mergedRows) {
    return mapRowsToCanonicalAuthUserIds(envIds, mergedRows);
  }

  if (mergedError) {
    console.warn(
      "[inbound-staff-ids] canonicalizeInboundEnvIdsToAuthUserIds merged query:",
      mergedError.message
    );
  }

  const { data: byUserColumn } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id")
    .in("user_id", envIds);

  const matchedAsAuthUserId = new Set(
    (byUserColumn ?? [])
      .map((r) => (typeof r.user_id === "string" ? r.user_id : null))
      .filter((id): id is string => Boolean(id))
  );
  const needProfilePkLookup = envIds.filter((e) => !matchedAsAuthUserId.has(e));

  const { data: byPk } =
    needProfilePkLookup.length > 0
      ? await supabaseAdmin.from("staff_profiles").select("id, user_id").in("id", needProfilePkLookup)
      : { data: [] as { id: string; user_id: string }[] };

  const profilePkToUserId = new Map(
    (byPk ?? [])
      .filter((r): r is { id: string; user_id: string } => typeof r.user_id === "string" && Boolean(r.id))
      .map((r) => [r.id, r.user_id] as const)
  );

  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of envIds) {
    let canonical: string;
    if (matchedAsAuthUserId.has(e)) {
      canonical = e;
    } else {
      const fromPk = profilePkToUserId.get(e);
      canonical = fromPk ?? e;
    }
    const u = parseStaffUserUuid(canonical);
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

/**
 * Whether this staff member would appear on the inbound browser ring list (env IDs + DB-eligible staff),
 * without scanning all `staff_profiles` rows. Used by GET `/api/softphone/token` for `identity_in_inbound_ring_list`.
 */
export async function computeIdentityInInboundRingListForStaff(staff: StaffProfile): Promise<boolean> {
  /** Env allowlists are evaluated when building TwiML ring targets; token minting reflects per-staff policy only. */
  return matchesSoftphoneTokenEligibilityForInboundRing(staff);
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
 * Env-configured inbound ring IDs plus `staff_profiles` rows eligible for the same identity as
 * GET `/api/softphone/token` (`matchesSoftphoneTokenEligibilityForInboundRing`). That includes active
 * nurses without `phone_access_enabled`, matching LIVE keypad / Twilio Device registration.
 * Order: env first, then DB.
 */
/**
 * Backup ring tier: comma/semicolon-separated auth UUIDs (`TWILIO_VOICE_BACKUP_STAFF_USER_IDS`).
 * Disjoint from primary ring list; second `<Dial>` step after primary times out.
 */
export function resolveBackupInboundStaffUserIdsFromEnv(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const raw = process.env.TWILIO_VOICE_BACKUP_STAFF_USER_IDS?.trim() ?? "";
  if (!raw) return [];
  for (const part of raw.split(/[,;\s]+/)) {
    const id = parseStaffUserUuid(part);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export async function resolveBackupInboundStaffUserIdsAsync(): Promise<string[]> {
  const envIdsRaw = resolveBackupInboundStaffUserIdsFromEnv();
  return canonicalizeInboundEnvIdsToAuthUserIds(envIdsRaw);
}

async function resolveInboundBrowserStaffUserIdsAsyncImpl(): Promise<string[]> {
  const envIdsRaw = resolveInboundBrowserStaffUserIds();
  const envIds = await canonicalizeInboundEnvIdsToAuthUserIds(envIdsRaw);
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, role, is_active, phone_access_enabled, phone_calling_profile")
    .eq("is_active", true)
    .not("user_id", "is", null);

  if (error) {
    console.warn("[inbound-staff-ids] resolveInboundBrowserStaffUserIdsAsync:", error.message);
    console.log(
      JSON.stringify({
        tag: "inbound-ring-diag",
        step: "resolveInboundBrowserStaffUserIdsAsync",
        db_error: error.message,
        env_id_count: envIds.length,
      })
    );
    return envIds;
  }

  const rows = data ?? [];
  const dbIds = rows
    .filter((r) => {
      if (typeof r.role !== "string") return false;
      const pcp = (r as { phone_calling_profile?: string }).phone_calling_profile;
      const phone_calling_profile: StaffProfile["phone_calling_profile"] =
        pcp === "outbound_only" || pcp === "inbound_disabled" || pcp === "inbound_outbound"
          ? pcp
          : "inbound_outbound";
      return matchesSoftphoneTokenEligibilityForInboundRing({
        role: r.role as StaffProfile["role"],
        is_active: r.is_active === true,
        phone_access_enabled: r.phone_access_enabled === true,
        phone_calling_profile,
      });
    })
    .map((r) => (typeof r.user_id === "string" ? r.user_id : null))
    .filter((id): id is string => Boolean(id && parseStaffUserUuid(id)));

  const merged = mergeUniqueOrdered(envIds, dbIds);
  console.log(
    JSON.stringify({
      tag: "inbound-ring-diag",
      step: "resolveInboundBrowserStaffUserIdsAsync",
      env_id_count: envIds.length,
      staff_profiles_active_rows: rows.length,
      after_token_eligibility_gate: dbIds.length,
      merged_total: merged.length,
    })
  );

  return merged;
}

/**
 * Full inbound browser ring list (env + all DB-eligible staff). Expensive: scans active `staff_profiles`.
 * Cached ~60s so Twilio/inbound handlers do not repeat the full scan every call.
 */
const resolveInboundBrowserStaffUserIdsAsyncCached = unstable_cache(
  resolveInboundBrowserStaffUserIdsAsyncImpl,
  ["resolve-inbound-browser-staff-user-ids"],
  { revalidate: 60 }
);

export async function resolveInboundBrowserStaffUserIdsAsync(): Promise<string[]> {
  return resolveInboundBrowserStaffUserIdsAsyncCached();
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
