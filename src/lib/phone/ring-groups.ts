/**
 * Ring groups: DB-backed membership (primary) with env fallback when a group has no eligible DB members.
 */

import { supabaseAdmin } from "@/lib/admin";
import { matchesSoftphoneTokenEligibilityForInboundRing, type StaffProfile } from "@/lib/staff-profile";
import { canonicalizeInboundEnvIdsToAuthUserIds } from "@/lib/softphone/inbound-staff-ids";

export const INBOUND_RING_GROUP_KEYS = ["intake", "admin", "billing", "on_call"] as const;
export type InboundRingGroupKey = (typeof INBOUND_RING_GROUP_KEYS)[number];

export type RingGroupId = "intake" | "admin" | "on_call" | "billing";

export type RingMode = "simultaneous" | "sequential";

export type RingGroupDefinition = {
  id: RingGroupId;
  label: string;
  /** Escalation order index (lower = earlier). */
  escalationOrder: number;
  ringMode: RingMode;
  /**
   * Env var holding comma-separated auth UUIDs (fallback when DB returns no eligible members for this group).
   */
  userIdsEnvVar: string | null;
};

/**
 * Hardcoded structure; membership from DB first, then env per group.
 */
export const RING_GROUP_DEFINITIONS: readonly RingGroupDefinition[] = [
  { id: "intake", label: "Intake", escalationOrder: 10, ringMode: "simultaneous", userIdsEnvVar: "SAINTLY_RING_GROUP_INTAKE_USER_IDS" },
  { id: "admin", label: "Admin", escalationOrder: 20, ringMode: "simultaneous", userIdsEnvVar: "SAINTLY_RING_GROUP_ADMIN_USER_IDS" },
  { id: "billing", label: "Billing", escalationOrder: 30, ringMode: "simultaneous", userIdsEnvVar: "SAINTLY_RING_GROUP_BILLING_USER_IDS" },
  { id: "on_call", label: "On-call", escalationOrder: 5, ringMode: "simultaneous", userIdsEnvVar: "SAINTLY_RING_GROUP_ON_CALL_USER_IDS" },
];

export function isInboundRingGroupKey(value: string): value is InboundRingGroupKey {
  return (INBOUND_RING_GROUP_KEYS as readonly string[]).includes(value);
}

export function ringGroupKeyLabel(key: string): string {
  const def = RING_GROUP_DEFINITIONS.find((d) => d.id === key);
  return def?.label ?? key;
}

function parseUuidListFromEnv(raw: string | undefined): string[] {
  const s = raw?.trim() ?? "";
  if (!s) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of s.split(/[,;\s]+/)) {
    const t = part.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(part.trim());
  }
  return out;
}

async function resolveRingGroupUserIdsFromEnv(groupId: RingGroupId): Promise<string[]> {
  const def = RING_GROUP_DEFINITIONS.find((g) => g.id === groupId);
  if (!def?.userIdsEnvVar) return [];
  const raw = process.env[def.userIdsEnvVar]?.trim();
  const parsed = parseUuidListFromEnv(raw);
  return canonicalizeInboundEnvIdsToAuthUserIds(parsed);
}

/**
 * Eligible users from DB for one ring group (active staff, inbound ring on, softphone eligibility gate).
 */
export async function resolveRingGroupUserIdsFromDb(groupId: RingGroupId): Promise<string[]> {
  const { data: rows, error } = await supabaseAdmin
    .from("inbound_ring_group_memberships")
    .select("user_id, created_at")
    .eq("ring_group_key", groupId)
    .eq("is_enabled", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[ring-groups] resolveRingGroupUserIdsFromDb:", error.message);
    return [];
  }
  if (!rows?.length) return [];

  const userIds = [
    ...new Set(rows.map((r) => (typeof r.user_id === "string" ? r.user_id : null)).filter(Boolean)),
  ] as string[];

  const { data: profiles, error: pErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, role, is_active, phone_access_enabled, inbound_ring_enabled, phone_calling_profile")
    .in("user_id", userIds);

  if (pErr) {
    console.warn("[ring-groups] staff_profiles for ring groups:", pErr.message);
    return [];
  }

  const profileByUserId = new Map(
    (profiles ?? [])
      .filter((p): p is typeof p & { user_id: string } => typeof p.user_id === "string" && Boolean(p.user_id))
      .map((p) => [p.user_id, p] as const)
  );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const uid = typeof r.user_id === "string" ? r.user_id : null;
    if (!uid) continue;
    const k = uid.toLowerCase();
    if (seen.has(k)) continue;
    const sp = profileByUserId.get(uid);
    if (!sp || sp.is_active !== true || sp.inbound_ring_enabled !== true) continue;
    if (
      !matchesSoftphoneTokenEligibilityForInboundRing({
        role: sp.role as StaffProfile["role"],
        is_active: sp.is_active === true,
        phone_access_enabled: sp.phone_access_enabled === true,
        phone_calling_profile:
          typeof (sp as { phone_calling_profile?: string }).phone_calling_profile === "string"
            ? ((sp as { phone_calling_profile: StaffProfile["phone_calling_profile"] }).phone_calling_profile ??
              "inbound_outbound")
            : "inbound_outbound",
      })
    ) {
      continue;
    }
    seen.add(k);
    out.push(uid);
  }

  return out;
}

/**
 * Resolve user ids for a ring group: **DB first**; if no eligible members, **env fallback**.
 */
export async function resolveRingGroupUserIds(groupId: RingGroupId): Promise<string[]> {
  const fromDb = await resolveRingGroupUserIdsFromDb(groupId);
  if (fromDb.length > 0) {
    return fromDb;
  }
  return resolveRingGroupUserIdsFromEnv(groupId);
}

/**
 * Merge multiple groups in escalation order (by definition order), de-duplicating user ids in order.
 */
export async function resolveMergedRingGroupsOrdered(groupIds: RingGroupId[]): Promise<string[]> {
  const defs = [...RING_GROUP_DEFINITIONS].sort((a, b) => a.escalationOrder - b.escalationOrder);
  const orderedIds = [...groupIds].sort(
    (a, b) => (defs.find((d) => d.id === a)?.escalationOrder ?? 99) - (defs.find((d) => d.id === b)?.escalationOrder ?? 99)
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const gid of orderedIds) {
    const ids = await resolveRingGroupUserIds(gid);
    for (const id of ids) {
      const k = id.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(id);
      }
    }
  }
  return out;
}

/**
 * Optional: restrict to users that still have active device registrations (FCM / Twilio identity).
 * If this fails open, we still ring — deterministic fallback is PSTN / voicemail.
 */
export async function filterUserIdsWithActiveVoiceDevices(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("devices")
    .select("user_id")
    .in("user_id", userIds)
    .eq("is_active", true);

  if (error) {
    console.warn("[ring-groups] filterUserIdsWithActiveVoiceDevices:", error.message);
    return userIds;
  }
  const active = new Set(
    (data ?? [])
      .map((r) => (typeof r.user_id === "string" ? r.user_id : null))
      .filter((id): id is string => Boolean(id))
  );
  const filtered = userIds.filter((id) => active.has(id));
  return filtered.length > 0 ? filtered : userIds;
}
