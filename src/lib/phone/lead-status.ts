export const LEAD_STATUSES = [
  "new_lead",
  "contacted",
  "scheduled",
  "admitted",
  "not_qualified",
  "unclassified",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function parseLeadStatus(raw: unknown): LeadStatus | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  return (LEAD_STATUSES as readonly string[]).includes(s) ? (s as LeadStatus) : null;
}

