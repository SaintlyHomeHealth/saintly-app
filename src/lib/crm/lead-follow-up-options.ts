/**
 * Stored in `leads.next_action` (text). Labels are for UI only.
 */
export const LEAD_NEXT_ACTION_OPTIONS = [
  { value: "call_again", label: "Call again" },
  { value: "text_follow_up", label: "Text follow-up" },
  { value: "schedule_soc", label: "Schedule SOC" },
  { value: "verify_insurance", label: "Verify insurance" },
  { value: "get_doctor_info", label: "Get doctor info" },
  { value: "convert_to_patient", label: "Convert to patient" },
  { value: "no_further_action", label: "No further action" },
  { value: "call_patient", label: "Call patient" },
  { value: "call_referral", label: "Call referral" },
  { value: "waiting_docs", label: "Waiting on docs" },
  { value: "other", label: "Other" },
] as const;

export type LeadNextActionValue = (typeof LEAD_NEXT_ACTION_OPTIONS)[number]["value"];

const SET = new Set<string>(LEAD_NEXT_ACTION_OPTIONS.map((o) => o.value));

export function isValidLeadNextAction(v: string): v is LeadNextActionValue {
  return SET.has(v);
}

const LABEL_BY_VALUE = Object.fromEntries(LEAD_NEXT_ACTION_OPTIONS.map((o) => [o.value, o.label])) as Record<
  LeadNextActionValue,
  string
>;

export function formatLeadNextActionLabel(v: string | null | undefined): string {
  if (!v || typeof v !== "string") return "—";
  const t = v.trim();
  return LABEL_BY_VALUE[t as LeadNextActionValue] ?? t.replace(/_/g, " ");
}
