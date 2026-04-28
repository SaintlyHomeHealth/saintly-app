/**
 * `conversations.lead_status` — SMS intake pipeline (DB check constraint).
 * Keep in sync with `conversations_lead_status_check` in Supabase migrations.
 */

export const CONVERSATION_LEAD_STATUSES = [
  "new",
  "spoke",
  "verify_insurance",
  "scheduled",
  "admitted",
  "not_qualified",
] as const;

export type ConversationLeadStatus = (typeof CONVERSATION_LEAD_STATUSES)[number];

const ALLOWED = new Set<string>(CONVERSATION_LEAD_STATUSES);

/** Legacy values from older app versions / UI; map to current pipeline. */
const LEGACY_TO_CANON: Readonly<Record<string, ConversationLeadStatus>> = {
  new_lead: "new",
  contacted: "spoke",
  unclassified: "new",
};

export function isConversationLeadStatus(value: string): value is ConversationLeadStatus {
  return ALLOWED.has(value);
}

/**
 * Coerces any input to a value allowed on `conversations.lead_status` for inserts/updates.
 * Unknown or empty → `'new'`.
 */
export function normalizeConversationLeadStatusForInsert(raw: unknown): ConversationLeadStatus {
  if (raw === null || raw === undefined) return "new";
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "new";
  if (isConversationLeadStatus(s)) return s;
  const mapped = LEGACY_TO_CANON[s];
  if (mapped) return mapped;
  const lower = s.toLowerCase();
  const mappedLower = LEGACY_TO_CANON[lower];
  if (mappedLower) return mappedLower;
  return "new";
}

export function conversationLeadStatusDisplayLabel(raw: string | null | undefined): string {
  const canon = normalizeConversationLeadStatusForInsert(raw);
  switch (canon) {
    case "new":
      return "New";
    case "spoke":
      return "Spoke";
    case "verify_insurance":
      return "Verify insurance";
    case "scheduled":
      return "Scheduled";
    case "admitted":
      return "Admitted";
    case "not_qualified":
      return "Not qualified";
    default:
      return "New";
  }
}
