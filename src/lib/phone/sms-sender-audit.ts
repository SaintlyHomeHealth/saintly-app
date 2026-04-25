import "server-only";

import { isSaintlyBackupSmsE164 } from "@/lib/twilio/sms-from-numbers";

export type OutboundSmsAuditRow = {
  metadata: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/**
 * Twilio `From` for an outbound row: status callback wins when present; otherwise initial send snapshot.
 */
export function extractOutboundSmsFromNumber(metadata: unknown): string {
  const m = asRecord(metadata);
  if (!m) return "(no metadata)";
  const td = m.twilio_delivery;
  if (td && typeof td === "object" && !Array.isArray(td)) {
    const o = td as Record<string, unknown>;
    const f = o.from;
    if (typeof f === "string" && f.trim()) return f.trim();
  }
  return "(awaiting From in status callback — or Messaging Service pool)";
}

/** Best-effort path / feature label for rollup. */
export function extractOutboundSmsPath(metadata: unknown): string {
  const m = asRecord(metadata);
  if (!m) return "other";
  const src = m.source;
  if (typeof src === "string" && src.trim()) return src.trim();
  if (m.sent_by_user_id != null && String(m.sent_by_user_id).trim() !== "") {
    return "staff_conversation_compose";
  }
  return "other";
}

export type SmsSenderFromRollup = {
  fromDisplay: string;
  count: number;
  isBackup: boolean;
  byPath: { path: string; count: number }[];
};

export function rollUpOutboundSmsByFrom(rows: OutboundSmsAuditRow[]): {
  total: number;
  backupCount: number;
  byFrom: SmsSenderFromRollup[];
} {
  type Agg = { count: number; byPath: Map<string, number>; fromKey: string; isBackup: boolean };
  const map = new Map<string, Agg>();

  let total = 0;
  let backupCount = 0;

  for (const row of rows) {
    total++;
    const rawFrom = extractOutboundSmsFromNumber(row.metadata);
    const path = extractOutboundSmsPath(row.metadata);
    const isBackup = isSaintlyBackupSmsE164(rawFrom);
    if (isBackup) backupCount++;

    const key = rawFrom;
    let agg = map.get(key);
    if (!agg) {
      agg = { count: 0, byPath: new Map(), fromKey: key, isBackup };
      map.set(key, agg);
    }
    agg.count++;
    agg.byPath.set(path, (agg.byPath.get(path) ?? 0) + 1);
  }

  const byFrom: SmsSenderFromRollup[] = [...map.values()]
    .map((a) => ({
      fromDisplay: a.fromKey,
      count: a.count,
      isBackup: a.isBackup,
      byPath: [...a.byPath.entries()]
        .map(([path, count]) => ({ path, count }))
        .sort((x, y) => y.count - x.count || x.path.localeCompare(y.path)),
    }))
    .sort((a, b) => b.count - a.count || a.fromDisplay.localeCompare(b.fromDisplay));

  return { total, backupCount, byFrom };
}
