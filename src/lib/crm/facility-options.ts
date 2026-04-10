/**
 * Canonical dropdown values for the Facilities CRM module.
 * Reuse these for filters, forms, and future shared pickers.
 */

export const FACILITY_TYPE_OPTIONS = [
  "Hospital",
  "Skilled Nursing Facility",
  "Assisted Living",
  "Independent Living",
  "Rehab Hospital",
  "LTACH",
  "Wound Clinic",
  "Primary Care Office",
  "Cardiology Office",
  "Orthopedic Office",
  "Podiatry Office",
  "Nephrology Office",
  "Pulmonology Office",
  "Oncology Office",
  "Pain Management",
  "Neurology Office",
  "Internal Medicine",
  "Geriatrics",
  "Hospice",
  "Dialysis Center",
  "Case Management Office",
  "Home Visit Physician Group",
  "Other",
] as const;

export type FacilityTypeOption = (typeof FACILITY_TYPE_OPTIONS)[number];

export const FACILITY_STATUS_OPTIONS = [
  "New",
  "Prospect",
  "Active Relationship",
  "Warm",
  "Needs Follow-Up",
  "Referral Source",
  "Not Interested",
  "Do Not Visit",
  "Inactive",
] as const;

export type FacilityStatusOption = (typeof FACILITY_STATUS_OPTIONS)[number];

export const FACILITY_PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;

export type FacilityPriorityOption = (typeof FACILITY_PRIORITY_OPTIONS)[number];

export const FACILITY_ACTIVITY_TYPE_OPTIONS = [
  "In-Person Visit",
  "Cold Drop-In",
  "Scheduled Meeting",
  "Phone Call",
  "Voicemail",
  "Text",
  "Email",
  "Fax Drop",
  "Lunch / In-Service",
  "Follow-Up Visit",
  "Referral Received",
  "Other",
] as const;

export const FACILITY_ACTIVITY_OUTCOME_OPTIONS = [
  "No Answer",
  "Front Desk Only",
  "Met Decision Maker",
  "Left Materials",
  "Good Conversation",
  "Asked to Follow Up",
  "Wants Packet Faxed",
  "Wants Email Info",
  "Not Interested",
  "Already Have Agency",
  "Gatekeeper Blocked",
  "Referral Sent",
  "Future Opportunity",
] as const;

/** Contact preference — keep short labels for mobile forms. */
export const FACILITY_PREFERRED_CONTACT_OPTIONS = [
  "Phone",
  "Mobile",
  "Text",
  "Email",
  "Fax",
  "In Person",
] as const;

export function isValidFacilityType(v: string): v is FacilityTypeOption {
  return (FACILITY_TYPE_OPTIONS as readonly string[]).includes(v);
}

export function isValidFacilityStatus(v: string): v is FacilityStatusOption {
  return (FACILITY_STATUS_OPTIONS as readonly string[]).includes(v);
}

export function isValidFacilityPriority(v: string): v is FacilityPriorityOption {
  return (FACILITY_PRIORITY_OPTIONS as readonly string[]).includes(v);
}

export function isValidFacilityActivityType(v: string): boolean {
  return (FACILITY_ACTIVITY_TYPE_OPTIONS as readonly string[]).includes(v);
}

export function isValidFacilityActivityOutcome(v: string): boolean {
  return (FACILITY_ACTIVITY_OUTCOME_OPTIONS as readonly string[]).includes(v);
}
