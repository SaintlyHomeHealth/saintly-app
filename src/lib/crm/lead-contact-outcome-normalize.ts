import { ATTEMPT_ACTION_KEYS, type AttemptActionKey } from "@/lib/crm/lead-contact-log";
import { isValidLeadContactOutcome } from "@/lib/crm/lead-contact-outcome";

/** Map human labels (and short labels) to canonical `leads.last_outcome` values. */
const RESULT_LABEL_TO_VALUE: Record<string, string> = {
  "No answer": "no_answer",
  "Spoke": "spoke",
  "Left VM": "left_voicemail",
  "Left voicemail": "left_voicemail",
  "Text sent": "text_sent",
  "Spoke + scheduled": "spoke_scheduled",
  "Not interested": "not_interested",
  "Wrong number": "wrong_number",
};

/**
 * Normalize contact result before save. Pass-through when already a valid enum value.
 */
export function normalizeContactOutcomeResult(value: string): string {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t) return "";
  if (isValidLeadContactOutcome(t)) return t;
  const mapped = RESULT_LABEL_TO_VALUE[t];
  if (mapped && isValidLeadContactOutcome(mapped)) return mapped;
  return t;
}

const ACTION_LABEL_TO_KEY: Record<string, AttemptActionKey> = {
  Called: "called",
  "Left voicemail": "left_voicemail",
  "Sent text": "sent_text",
  "Received text": "received_text",
  "Spoke live": "spoke_live",
};

const ALLOWED = new Set<string>(ATTEMPT_ACTION_KEYS);

/**
 * Normalize attempted action labels/keys to canonical keys (`contact_attempt_actions` / log).
 */
export function normalizeAttemptActionKeys(actions: string[]): string[] {
  const out: string[] = [];
  for (const raw of actions) {
    const t = typeof raw === "string" ? raw.trim() : "";
    if (!t) continue;
    let k = t;
    if (!ALLOWED.has(t)) {
      k = ACTION_LABEL_TO_KEY[t] ?? t;
    }
    if (ALLOWED.has(k)) out.push(k);
  }
  return [...new Set(out)];
}
