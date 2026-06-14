/** Outcomes that suggest creating a referral lead after logging activity. */
export const REFERRAL_LEAD_SUGGESTED_OUTCOMES = [
  "Referral Sent",
  "Referral Received",
  "Good Conversation",
  "Met Decision Maker",
  "Wants Packet Faxed",
] as const;

export const REFERRAL_LEAD_PRIMARY_OUTCOMES = ["Referral Sent", "Referral Received"] as const;

export function isReferralLeadSuggestedOutcome(outcome: string | null | undefined): boolean {
  const o = (outcome ?? "").trim();
  return (REFERRAL_LEAD_SUGGESTED_OUTCOMES as readonly string[]).includes(o);
}

export function isReferralLeadPrimaryOutcome(outcome: string | null | undefined): boolean {
  const o = (outcome ?? "").trim();
  return (REFERRAL_LEAD_PRIMARY_OUTCOMES as readonly string[]).includes(o);
}

export const REFERRAL_SERVICE_OPTIONS = [
  { value: "RN", label: "SN / RN" },
  { value: "PT", label: "PT" },
  { value: "OT", label: "OT" },
  { value: "ST", label: "ST" },
  { value: "HHA", label: "HHA" },
  { value: "MSW", label: "MSW" },
  { value: "Other", label: "Other" },
] as const;

export type FacilityReferralLeadModalDefaults = {
  contactId?: string | null;
  activityId?: string | null;
  defaultRepId?: string | null;
  defaultNotes?: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientPhone?: string;
  patientDob?: string | null;
  payer?: string;
  serviceNeeded?: string;
  originatingActivityType?: string | null;
  originatingOutcome?: string | null;
};
