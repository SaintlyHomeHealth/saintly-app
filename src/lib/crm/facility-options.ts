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
 * One-line, sales-focused blurbs for facility types (why they matter for home health referrals).
 * Keys match stored `type` values; used in FacilityTypeSelect only (filtering unchanged).
 */
export const FACILITY_TYPE_DESCRIPTIONS: Record<FacilityTypeOption, string> = {
  Hospital: "24/7 discharges—post-acute patients who still need skilled care at home.",
  "Skilled Nursing Facility": "Daily discharges—patients stepping down who may still qualify for HH.",
  "Assisted Living": "When needs spike, AL looks outward—opening for skilled nursing at home.",
  "Independent Living": "Lighter clinical touch, but moves & crises still open referral windows.",
  "Rehab Hospital": "Rehab-to-home handoffs—nursing & therapy where they live.",
  LTACH: "Long, complex stays—discharge planning decides who’s HH-eligible.",
  "Wound Clinic": "Chronic wounds need skilled nursing—easy home-visit story.",
  "Primary Care Office": "Orders & panels—relationships drive chronic-care referrals.",
  "Cardiology Office": "CHF & post-cardiac volume—HH cuts readmissions & bounce-backs.",
  "Orthopedic Office": "Joints & fractures—post-op skilled nursing & PT at home.",
  "Podiatry Office": "Diabetic feet & wounds—nursing & wound care in the home.",
  "Nephrology Office": "CKD complexity—stabilize between clinic visits.",
  "Pulmonology Office": "COPD & O2—home support keeps patients out of the hospital.",
  "Oncology Office": "Weakness & caregiver load—bridge care between treatments.",
  "Pain Management": "High-touch patients—pairs with nursing, PT, or safety at home.",
  "Neurology Office": "Stroke, MS, Parkinson’s—therapy & nursing in the home.",
  "Internal Medicine": "Chronic panels—scripts, intros, and follow-up referrals start here.",
  Geriatrics: "Frailty, falls, med stacks—classic skilled home candidates.",
  Hospice: "Know hospice vs HH—right talk keeps placements appropriate.",
  "Dialysis Center": "Skilled, co-morbid crowd—support between chair days.",
  "Case Management Office": "Discharge planners steer beds—often your fastest referral path.",
  "Home Visit Physician Group": "Already in the home—fastest path to ongoing skilled orders.",
  Other: "Qualify source & path each visit—no default playbook.",
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
