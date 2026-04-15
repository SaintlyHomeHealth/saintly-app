/**
 * Recruiting candidate activity → iMessage-style timeline (mirrors Credentialing/Leads patterns).
 */

export type RecruitingActivityRow = {
  id: string;
  activity_type: string;
  outcome: string | null;
  body: string | null;
  created_at: string;
  created_by: string | null;
};

export type RecruitingTimelineEntry =
  | { kind: "note"; id: string; body: string; created_at: string; created_by: string | null }
  | {
      kind: "event";
      id: string;
      headline: string;
      body: string | null;
      created_at: string;
      created_by: string | null;
    };

/** Parsing/OCR and field-apply audit rows — keep them out of the conversation thread. */
export function isRecruitingTimelineNoise(row: { activity_type: string }): boolean {
  const t = row.activity_type.trim();
  return t === "resume_parsed" || t === "resume_applied";
}

export function formatRecruitingActivityHeadline(a: Pick<RecruitingActivityRow, "activity_type" | "outcome">): string {
  const t = a.activity_type;
  const o = a.outcome ?? "";
  if (t === "call" && o === "outbound") return "Outgoing call";
  if (t === "call" && o === "no_answer") return "Call — no answer";
  if (t === "call" && o === "spoke") return "Call — spoke";
  if (t === "voicemail" && o === "left_voicemail") return "Voicemail left";
  if (t === "text" && o === "sent") return "Text sent";
  if (t === "status_change" && o === "interested") return "Interested";
  if (t === "status_change" && o === "not_interested") return "Not interested";
  if (t === "status_change" && o === "maybe_later") return "Maybe later";
  if (t === "status_change" && o === "follow_up_later") return "Follow up later";
  if (t === "status_change" && o === "no_response") return "No response";
  if (t === "follow_up_set") return "Follow-up scheduled";
  if (t === "note") return "Note";
  if (t === "resume_uploaded") return "Resume uploaded";
  if (t === "resume_replaced") return "Resume replaced";
  return [t, o].filter(Boolean).join(" · ") || "Activity";
}

const phoenixWhen = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Phoenix",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Subtle timestamp for timeline rows (Phoenix, matches recruiting detail fields). */
export function formatRecruitingTimelineTimestamp(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return "—";
  return phoenixWhen.format(d);
}

/**
 * Newest first. Manual notes → blue bubble entries; logged outcomes → compact event rows.
 */
export function buildRecruitingTimelineEntries(rows: RecruitingActivityRow[]): RecruitingTimelineEntry[] {
  const out: RecruitingTimelineEntry[] = [];
  for (const r of rows) {
    if (isRecruitingTimelineNoise(r)) continue;

    if (r.activity_type === "note") {
      const body = (r.body ?? "").trim();
      if (!body) continue;
      out.push({ kind: "note", id: r.id, body, created_at: r.created_at, created_by: r.created_by });
      continue;
    }

    out.push({
      kind: "event",
      id: r.id,
      headline: formatRecruitingActivityHeadline(r),
      body: (r.body ?? "").trim() || null,
      created_at: r.created_at,
      created_by: r.created_by,
    });
  }

  out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return out;
}
