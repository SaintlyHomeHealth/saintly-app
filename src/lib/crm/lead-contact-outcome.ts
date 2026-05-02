/**
 * `leads.last_outcome` — logged result of a contact attempt (DB check constraint).
 */
export const LEAD_CONTACT_OUTCOME_OPTIONS = [
  { value: "spoke", label: "Spoke" },
  { value: "no_answer", label: "No answer" },
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

export function formatLeadContactOutcomeLabel(v: string | null | undefined): string {
  if (!v || typeof v !== "string") return "—";
  const t = v.trim();
  const norm = t.toLowerCase() === "contacted" ? "spoke" : t;
  return OUTCOME_LABELS[norm as LeadContactOutcomeValue] ?? norm.replace(/_/g, " ");
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
  lastOutcome: string | null | undefined
): string {
  if (!lastContactAtIso || typeof lastContactAtIso !== "string") return "—";
  const t = lastContactAtIso.trim();
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const out = formatLeadContactOutcomeLabel(lastOutcome);
  if (out === "—") return datePart;
  return `${datePart} – ${out}`;
}
