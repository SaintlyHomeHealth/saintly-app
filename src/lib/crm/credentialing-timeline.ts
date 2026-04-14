import { PAYER_CREDENTIALING_ACTIVITY_TYPES } from "@/lib/crm/credentialing-activity-types";

/** Activity rows shown as the main “conversation” thread (right-aligned bubbles). */
export function isCredentialingConversationActivity(activityType: string): boolean {
  const t = activityType.trim();
  if (t === "note" || t === PAYER_CREDENTIALING_ACTIVITY_TYPES.manual_note) return true;
  if (t === PAYER_CREDENTIALING_ACTIVITY_TYPES.follow_up) return true;
  return false;
}

/**
 * Noisy/low-signal entries to drop entirely from the UI (data remains in DB).
 * Does not remove meaningful status/document/attachment events.
 */
export function isCredentialingTimelineNoise(row: {
  activity_type: string;
  summary: string;
  details: string | null;
}): boolean {
  const t = row.activity_type.trim();
  const summary = row.summary.trim();

  if (t === PAYER_CREDENTIALING_ACTIVITY_TYPES.notes_updated) return true;

  if (t === PAYER_CREDENTIALING_ACTIVITY_TYPES.follow_up && summary === "Follow-up logged (timestamp updated)") {
    return true;
  }

  if (t === PAYER_CREDENTIALING_ACTIVITY_TYPES.record_updated && summary === "Record details updated") {
    return true;
  }

  return false;
}

export type CredentialingTimelinePartition<T extends { activity_type: string; summary: string; details: string | null; created_at: string }> = {
  conversation: T[];
  system: T[];
};

/** Newest first within each group. Noise removed entirely. */
export function partitionCredentialingTimeline<T extends { activity_type: string; summary: string; details: string | null; created_at: string }>(
  rows: T[]
): CredentialingTimelinePartition<T> {
  const kept = rows.filter((r) => !isCredentialingTimelineNoise(r));
  const conv: T[] = [];
  const sys: T[] = [];
  for (const r of kept) {
    if (isCredentialingConversationActivity(r.activity_type)) conv.push(r);
    else sys.push(r);
  }
  const byTimeDesc = (a: T, b: T) => Date.parse(b.created_at) - Date.parse(a.created_at);
  conv.sort(byTimeDesc);
  sys.sort(byTimeDesc);
  return { conversation: conv, system: sys };
}
