/**
 * CRM `leads.status` pipeline (distinct from `conversations.lead_status`).
 * Terminal: converted, dead_lead (still queryable).
 */
export const LEAD_PIPELINE_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  /** Facebook Lead Ads Zapier webhook (`/api/leads/facebook`). */
  { value: "new_lead", label: "New lead" },
  { value: "new_applicant", label: "New applicant" },
  { value: "attempted_contact", label: "Attempting contact" },
  { value: "spoke", label: "Spoke" },
  { value: "intake_in_progress", label: "Interested / hot" },
  { value: "waiting_on_documents", label: "Need documents" },
  { value: "verify_insurance", label: "Verify insurance" },
  { value: "waiting_on_referral", label: "Pending doctor / referral" },
  { value: "ready_to_convert", label: "Scheduled / ready to admit" },
  { value: "admitted", label: "Admitted" },
  { value: "converted", label: "Converted" },
  { value: "dead_lead", label: "Dead / not qualified" },
] as const;

/** CRM lead edit form: terminal states use explicit actions (convert / mark dead). */
export const LEAD_PIPELINE_STATUS_EDITABLE_OPTIONS = LEAD_PIPELINE_STATUS_OPTIONS.filter(
  (o) => o.value !== "converted" && o.value !== "dead_lead"
);

export type LeadPipelineStatus = (typeof LEAD_PIPELINE_STATUS_OPTIONS)[number]["value"];

const SET = new Set<string>(LEAD_PIPELINE_STATUS_OPTIONS.map((o) => o.value));

export function isValidLeadPipelineStatus(v: string): v is LeadPipelineStatus {
  return SET.has(v);
}

const LABELS = Object.fromEntries(LEAD_PIPELINE_STATUS_OPTIONS.map((o) => [o.value, o.label])) as Record<
  LeadPipelineStatus,
  string
>;

export function formatLeadPipelineStatusLabel(v: string | null | undefined): string {
  if (v == null || String(v).trim() === "") return "—";
  const raw = String(v).trim();
  const t = raw.toLowerCase() === "contacted" ? "spoke" : raw;
  return (LABELS as Record<string, string>)[t] ?? t.replace(/_/g, " ");
}

export function isLeadPipelineTerminal(status: string | null | undefined): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "converted" || s === "dead_lead";
}

/** False when another open lead should not be created for the same contact. */
export function isCrmLeadStatusActiveForContact(status: unknown): boolean {
  return !isLeadPipelineTerminal(typeof status === "string" ? status : "");
}
