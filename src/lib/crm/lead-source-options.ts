/** Matches `leads.source` DB check constraint. */
export const LEAD_SOURCE_OPTIONS = [
  { value: "phone", label: "Phone" },
  { value: "manual", label: "Manual" },
  { value: "walk_in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "email_referral", label: "Email — referral" },
  { value: "email_inquiry", label: "Email — inquiry" },
  { value: "hospital", label: "Hospital" },
  { value: "facebook", label: "Facebook" },
  { value: "facebook_ads", label: "Facebook ads (API)" },
  { value: "google", label: "Google" },
  { value: "other", label: "Other" },
] as const;

export type LeadSourceValue = (typeof LEAD_SOURCE_OPTIONS)[number]["value"];

const SET = new Set<string>(LEAD_SOURCE_OPTIONS.map((o) => o.value));

export function isValidLeadSource(v: string): v is LeadSourceValue {
  return SET.has(v);
}

export function formatLeadSourceLabel(v: string | null | undefined): string {
  if (!v || typeof v !== "string") return "—";
  const t = v.trim();
  const hit = LEAD_SOURCE_OPTIONS.find((o) => o.value === t);
  return hit?.label ?? t;
}
