/**
 * Ring groups: deterministic mapping from group id → user ids (env + hardcoded placeholders).
 * Future: load from DB; keep the same exported ids for a smooth migration.
 */

import { supabaseAdmin } from "@/lib/admin";
import { canonicalizeInboundEnvIdsToAuthUserIds } from "@/lib/softphone/inbound-staff-ids";

export type RingGroupId = "intake" | "admin" | "on_call" | "billing";

export type RingMode = "simultaneous" | "sequential";

export type RingGroupDefinition = {
  id: RingGroupId;
  label: string;
  /** Escalation order index (lower = earlier). */
  escalationOrder: number;
  ringMode: RingMode;
  /**
   * Env var holding comma-separated auth UUIDs (same format as TWILIO_VOICE_INBOUND_STAFF_USER_IDS).
   * Empty / unset = no members from env.
   */
  userIdsEnvVar: string | null;
};

/**
 * Hardcoded structure; membership from env per group.
 * Example: `SAINTLY_RING_GROUP_INTAKE_USER_IDS=uuid1,uuid2`
 */
export const RING_GROUP_DEFINITIONS: readonly RingGroupDefinition[] = [
  { id: "intake", label: "Intake", escalationOrder: 10, ringMode: "simultaneous", userIdsEnvVar: "SAINTLY_RING_GROUP_INTAKE_USER_IDS" },
  { id: "admin", label: "Admin", escalationOrder: 20, ringMode: "simultaneous", userIdsEnvVar: "SAINTLY_RING_GROUP_ADMIN_USER_IDS" },
  { id: "billing", label: "Billing", escalationOrder: 30, ringMode: "simultaneous", userIdsEnvVar: "SAINTLY_RING_GROUP_BILLING_USER_IDS" },
  { id: "on_call", label: "On-call", escalationOrder: 5, ringMode: "simultaneous", userIdsEnvVar: "SAINTLY_RING_GROUP_ON_CALL_USER_IDS" },
];

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

/**
 * Resolve user ids for a ring group (canonical auth UUIDs).
 */
export async function resolveRingGroupUserIds(groupId: RingGroupId): Promise<string[]> {
  const def = RING_GROUP_DEFINITIONS.find((g) => g.id === groupId);
  if (!def?.userIdsEnvVar) return [];
  const raw = process.env[def.userIdsEnvVar]?.trim();
  const parsed = parseUuidListFromEnv(raw);
  return canonicalizeInboundEnvIdsToAuthUserIds(parsed);
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
