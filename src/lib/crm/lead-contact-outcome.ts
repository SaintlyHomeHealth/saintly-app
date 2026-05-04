import { isLegacyContactedOutcomeToken, normalizeContactOutcomeResult } from "@/lib/crm/lead-contact-outcome-normalize";
import { formatAppDate } from "@/lib/datetime/app-timezone";

/**
 * `leads.last_outcome` — logged result of a contact attempt (DB check constraint).
 */
export const LEAD_CONTACT_OUTCOME_OPTIONS = [
  { value: "spoke", label: "Spoke" },
  { value: "no_answer", label: "No answer" },
  { value: "no_response", label: "No response" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "text_sent", label: "Text sent" },
  { value: "spoke_scheduled", label: "Spoke + scheduled" },
  { value: "not_interested", label: "Not interested" },
  { value: "wrong_number", label: "Wrong number" },
] as const;

export type LeadContactOutcomeValue = (typeof LEAD_CONTACT_OUTCOME_OPTIONS)[number]["value"];

const OUTCOME_SET = new Set<string>(LEAD_CONTACT_OUTCOME_OPTIONS.map((o) => o.value));

export function isValidLeadContactOutcome(v: string): v is LeadContactOutcomeValue {
  return OUTCOME_SET.has(v);
}

const OUTCOME_LABELS = Object.fromEntries(LEAD_CONTACT_OUTCOME_OPTIONS.map((o) => [o.value, o.label])) as Record<
  LeadContactOutcomeValue,
  string
>;

/**
 * Canonical outcome for UI + list logic.
 * Order: normalize stored outcome (contacted → spoke) first; if missing, infer from pipeline when
 * status is legacy contacted / spoke (migrated rows often have `last_outcome` null).
 */
export function resolveEffectiveLeadContactOutcome(
  lastOutcome: string | null | undefined,
  pipelineStatus: string | null | undefined
): string | null {
  const raw = typeof lastOutcome === "string" ? lastOutcome.trim() : "";
  if (raw) {
    if (isLegacyContactedOutcomeToken(raw)) return "spoke";
    const normalized = normalizeContactOutcomeResult(raw);
    if (isValidLeadContactOutcome(normalized)) return normalized;
    return null;
  }
  const stRaw = typeof pipelineStatus === "string" ? pipelineStatus : "";
  if (isLegacyContactedOutcomeToken(stRaw) || stRaw.trim().toLowerCase() === "spoke") return "spoke";
  return null;
}

export function formatLeadContactOutcomeLabel(
  v: string | null | undefined,
  pipelineStatus?: string | null
): string {
  const effective = resolveEffectiveLeadContactOutcome(v, pipelineStatus ?? null);
  if (!effective) return "—";
  return OUTCOME_LABELS[effective as LeadContactOutcomeValue] ?? effective.replace(/_/g, " ");
}

export type LeadContactTypeValue = "call" | "text";

const CONTACT_TYPE_SET = new Set<string>(["call", "text"]);

export function isValidLeadContactType(v: string): v is LeadContactTypeValue {
  return CONTACT_TYPE_SET.has(v);
}

export function formatLeadContactTypeLabel(v: string | null | undefined): string {
  if (v === "call") return "Call";
  if (v === "text") return "Text";
  return "—";
}

/** e.g. "Apr 1 – Left voicemail" */
export function formatLeadLastContactSummary(
  lastContactAtIso: string | null | undefined,
  lastOutcome: string | null | undefined,
  pipelineStatus?: string | null
): string {
  if (!lastContactAtIso || typeof lastContactAtIso !== "string") return "—";
  const t = lastContactAtIso.trim();
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = formatAppDate(d, "—", { month: "short", day: "numeric" });
  const out = formatLeadContactOutcomeLabel(lastOutcome, pipelineStatus);
  if (out === "—") return datePart;
  return `${datePart} – ${out}`;
}
