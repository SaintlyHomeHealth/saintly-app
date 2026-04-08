/**
 * Formatting and parsing for appended `leads.last_note` contact log blocks.
 * Blocks are separated by `\n\n---\n\n` (new) or `\n\n` before `[` (quick notes / legacy).
 */

export const ATTEMPT_ACTION_KEYS = [
  "called",
  "left_voicemail",
  "sent_text",
  "received_text",
  "spoke_live",
] as const;

export type AttemptActionKey = (typeof ATTEMPT_ACTION_KEYS)[number];

const ACTION_LABEL: Record<AttemptActionKey, string> = {
  called: "Called",
  left_voicemail: "Left voicemail",
  sent_text: "Sent text",
  received_text: "Received text",
  spoke_live: "Spoke live",
};

export function formatAttemptActionsList(keys: string[]): string {
  const labels = keys
    .filter((k): k is AttemptActionKey => ATTEMPT_ACTION_KEYS.includes(k as AttemptActionKey))
    .map((k) => ACTION_LABEL[k]);
  return labels.length > 0 ? labels.join(", ") : "—";
}

export function deriveContactTypeFromActions(keys: string[]): "call" | "text" {
  const hasCall = keys.some((k) => k === "called" || k === "left_voicemail" || k === "spoke_live");
  const hasText = keys.some((k) => k === "sent_text" || k === "received_text");
  if (hasText && !hasCall) return "text";
  return "call";
}

export function formatContactAttemptLogBlock(input: {
  attemptAt: Date;
  resultLabel: string;
  actionKeys: string[];
  nextStepLabel: string;
  followUpAt: Date | null;
  note: string;
}): string {
  const header = `[Contact attempt ${input.attemptAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}]`;
  const lines = [
    header,
    `Result: ${input.resultLabel}`,
    `Actions: ${formatAttemptActionsList(input.actionKeys)}`,
    `Next step: ${input.nextStepLabel}`,
    input.followUpAt
      ? `Follow-up: ${input.followUpAt.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`
      : "Follow-up: —",
  ];
  if (input.note.trim()) {
    lines.push(`Note: ${input.note.trim()}`);
  }
  return lines.join("\n");
}

export type ParsedNoteSegment = {
  id: string;
  sortMs: number;
  kind: "contact_attempt" | "quick_note" | "other";
  title: string;
  meta: string;
  body: string | null;
};

function parseLeadingTimestamp(block: string): number {
  const m = block.match(/^\[(?:Contact attempt|Quick note)\s+([^\]]+)\]/);
  if (!m?.[1]) return 0;
  const parsed = Date.parse(m[1]);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Split last_note into display segments for activity timeline. */
export function parseLastNoteSegments(lastNote: string | null | undefined): ParsedNoteSegment[] {
  const raw = typeof lastNote === "string" ? lastNote.trim() : "";
  if (!raw) return [];

  const chunks = raw.split(/\n\n---\n\n/);
  const parts: string[] = [];
  for (const c of chunks) {
    parts.push(...c.split(/\n\n(?=\[)/));
  }
  const out: ParsedNoteSegment[] = [];

  for (let i = 0; i < parts.length; i++) {
    const block = parts[i].trim();
    if (!block) continue;

    const sortMs = parseLeadingTimestamp(block);
    const isQuick = block.startsWith("[Quick note");
    const isContact = block.startsWith("[Contact attempt");

    if (isQuick) {
      const firstLine = block.split("\n")[0] ?? "";
      out.push({
        id: `quick-${i}-${sortMs}`,
        sortMs: sortMs || Date.now(),
        kind: "quick_note",
        title: "Quick note",
        meta: firstLine.replace(/^\[|\]$/g, "").slice(0, 120),
        body: block.includes("\n") ? block.split("\n").slice(1).join("\n").trim() || null : null,
      });
    } else if (isContact) {
      out.push({
        id: `contact-${i}-${sortMs}`,
        sortMs: sortMs || Date.now(),
        kind: "contact_attempt",
        title: "Contact attempt",
        meta: block.split("\n")[0]?.replace(/^\[|\]$/g, "") ?? "Contact attempt",
        body: block.includes("\n") ? block.split("\n").slice(1).join("\n").trim() : null,
      });
    } else {
      out.push({
        id: `other-${i}`,
        sortMs: sortMs || Date.now() - i,
        kind: "other",
        title: "Note",
        meta: "On file",
        body: block,
      });
    }
  }

  return out;
}
