import { parseLastNoteSegments, type ParsedNoteSegment } from "@/lib/crm/lead-contact-log";

export type LeadActivityRow = {
  id: string;
  lead_id: string;
  event_type: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by_user_id: string | null;
  deleted_at: string | null;
  deletable: boolean;
};

export type UnifiedTimelineItem =
  | { kind: "activity"; sortMs: number; activity: LeadActivityRow }
  | { kind: "legacy"; sortMs: number; seg: ParsedNoteSegment }
  | { kind: "lead_application_notes"; sortMs: number; body: string }
  | { kind: "lead_created"; sortMs: number };

function msFromIso(iso: string | null | undefined): number {
  if (!iso || typeof iso !== "string" || !iso.trim()) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Single chronological thread: oldest first (top), newest last (bottom).
 * Merges structured `lead_activities` with legacy `last_note` segments and lead snapshot rows.
 */
export function buildUnifiedLeadTimeline(input: {
  activities: LeadActivityRow[];
  lastNote: string | null | undefined;
  applicationNotes: string | null | undefined;
  leadCreatedAt: string | null | undefined;
}): UnifiedTimelineItem[] {
  const rows: UnifiedTimelineItem[] = [];

  for (const a of input.activities) {
    rows.push({ kind: "activity", sortMs: msFromIso(a.created_at), activity: a });
  }

  const segments = parseLastNoteSegments(input.lastNote);
  for (const seg of segments) {
    rows.push({ kind: "legacy", sortMs: seg.sortMs || 0, seg });
  }

  const notes = typeof input.applicationNotes === "string" ? input.applicationNotes.trim() : "";
  const createdMs = msFromIso(input.leadCreatedAt);
  if (notes) {
    rows.push({
      kind: "lead_application_notes",
      sortMs: !Number.isNaN(createdMs) && createdMs > 0 ? createdMs + 1 : Date.now(),
      body: notes,
    });
  }

  if (!Number.isNaN(createdMs) && createdMs > 0) {
    rows.push({ kind: "lead_created", sortMs: createdMs });
  }

  rows.sort((a, b) => a.sortMs - b.sortMs);
  return rows;
}
