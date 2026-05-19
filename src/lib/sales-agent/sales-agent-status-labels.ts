/**
 * Friendly status labels for the Sales Agent portal (maps internal CRM `leads.status`).
 */

const STATUS_LABELS: Record<string, string> = {
  new: "Submitted",
  new_lead: "Submitted",
  new_applicant: "Submitted",
  attempted_contact: "Under Review",
  spoke: "Under Review",
  intake_in_progress: "Under Review",
  waiting_on_documents: "Under Review",
  verify_insurance: "Insurance Verification",
  waiting_on_referral: "Waiting on Doctor Orders",
  ready_to_convert: "Accepted",
  admitted: "Accepted",
  converted: "Converted to Patient",
  dead_lead: "Not Eligible",
  duplicate_lead: "Duplicate",
};

/** CRM statuses grouped for sales-agent "pending" (in progress, not terminal). */
const PENDING_STATUSES = new Set([
  "attempted_contact",
  "spoke",
  "intake_in_progress",
  "waiting_on_documents",
  "verify_insurance",
  "waiting_on_referral",
  "ready_to_convert",
  "admitted",
]);

export function formatSalesAgentFriendlyStatus(
  status: string | null | undefined,
  opts?: { convertedToPatientAt?: string | null }
): string {
  if (opts?.convertedToPatientAt) return "Converted to Patient";
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "Submitted";
  if (STATUS_LABELS[s]) return STATUS_LABELS[s];
  if (s === "no_response" || s.includes("no_answer") || s.includes("voicemail")) {
    return "Unable to Reach";
  }
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isSalesAgentStatusDuplicate(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "duplicate_lead";
}

export function isSalesAgentStatusConverted(
  status: string | null | undefined,
  convertedToPatientAt?: string | null
): boolean {
  if (convertedToPatientAt) return true;
  return (status ?? "").trim().toLowerCase() === "converted";
}

export function isSalesAgentStatusNotEligible(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "dead_lead";
}

export function isSalesAgentStatusPending(
  status: string | null | undefined,
  convertedToPatientAt?: string | null
): boolean {
  const s = (status ?? "").trim().toLowerCase();
  if (isSalesAgentStatusConverted(s, convertedToPatientAt)) return false;
  if (isSalesAgentStatusNotEligible(s)) return false;
  if (isSalesAgentStatusDuplicate(s)) return false;
  if (s === "new" || s === "new_lead" || s === "new_applicant" || s === "") return true;
  return PENDING_STATUSES.has(s);
}

export function isSalesAgentStatusUnableToReach(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "attempted_contact" || s === "no_response";
}
