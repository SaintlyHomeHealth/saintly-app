import {
  CONVERSATION_LEAD_STATUSES,
  isConversationLeadStatus,
  normalizeConversationLeadStatusForInsert,
  type ConversationLeadStatus,
} from "@/lib/phone/conversation-lead-status";

export type LeadStatus = ConversationLeadStatus;

/** Canonical statuses allowed in forms and `conversations.lead_status`. */
export const LEAD_STATUSES = CONVERSATION_LEAD_STATUSES;

const LEGACY_FORM_VALUES = new Set(["new_lead", "contacted", "unclassified"]);

/**
 * Parses a submitted lead status; accepts legacy option values from old bookmarks/HTML.
 * Returns null if the value cannot be mapped to a allowed pipeline status.
 */
export function parseLeadStatus(raw: unknown): LeadStatus | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  const lower = s.toLowerCase();
  if (isConversationLeadStatus(lower)) return lower;
  if (LEGACY_FORM_VALUES.has(lower)) return normalizeConversationLeadStatusForInsert(lower);
  return null;
}
