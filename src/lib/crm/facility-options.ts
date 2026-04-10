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

/**
 * Short explanations for facility types (filters and forms). Keys match stored `type` values.
 */
export const FACILITY_TYPE_DESCRIPTIONS: Record<FacilityTypeOption, string> = {
  Hospital: "Acute care for injuries, surgeries, and medical emergencies",
  "Skilled Nursing Facility": "Short-term rehab and nursing care after hospital discharge",
  "Assisted Living": "Help with daily activities, not skilled medical care",
  "Independent Living": "Senior housing with little to no medical support",
  "Rehab Hospital": "Intensive rehab (3+ hrs/day) for stroke, surgery, or injury recovery",
  LTACH: "For medically complex patients (ventilators, severe wounds, ICU step-down)",
  "Wound Clinic": "Specialized treatment for chronic or non-healing wounds",
  "Primary Care Office": "General medical care and referrals for all conditions",
  "Cardiology Office": "Heart conditions, monitoring, and post-cardiac care",
  "Orthopedic Office": "Bone, joint, and post-surgical rehab patients",
  "Podiatry Office": "Foot care, wounds, and diabetic complications",
  "Nephrology Office": "Kidney disease and dialysis-related care",
  "Pulmonology Office": "Lung conditions like COPD and breathing issues",
  "Oncology Office": "Cancer treatment and ongoing care coordination",
  "Pain Management": "Chronic pain treatment and injection therapies",
  "Neurology Office": "Stroke, brain, and neurological conditions",
  "Internal Medicine": "Primary care focused on adult patients",
  Geriatrics: "Medical care specialized for elderly patients",
  Hospice: "End-of-life comfort and support care",
  "Dialysis Center": "Ongoing dialysis treatment for kidney failure patients",
  "Case Management Office": "Coordinates care and referrals for patients",
  "Home Visit Physician Group": "Doctors who see patients at home",
  Other: "Miscellaneous or uncategorized facility",
};

/**
 * Optional longer first line in dropdowns; value stored remains the canonical type (e.g. LTACH).
 */
export const FACILITY_TYPE_DISPLAY_TITLE: Partial<Record<FacilityTypeOption, string>> = {
  LTACH: "LTACH (Critical Illness Recovery)",
};

export function facilityTypeDropdownTitle(t: FacilityTypeOption): string {
  return FACILITY_TYPE_DISPLAY_TITLE[t] ?? t;
}

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
