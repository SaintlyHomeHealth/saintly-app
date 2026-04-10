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

export type FacilityTypePlaybookEntry = {
  description: string;
  play: string;
};

/**
 * Sales playbook for facility types: why it matters + who to ask.
 * Keys match stored `type` values (LTACH uses canonical key; display title may differ).
 */
export const FACILITY_TYPE_PLAYBOOK: Record<FacilityTypeOption, FacilityTypePlaybookEntry> = {
  Hospital: {
    description: "Daily discharges → prime home health referrals",
    play: "Ask for case management department",
  },
  "Skilled Nursing Facility": {
    description: "Short-term rehab → constant home health discharges",
    play: "Ask for discharge planner or social worker",
  },
  "Assisted Living": {
    description: "Residents decline over time → steady home health referrals",
    play: "Ask for wellness director or nurse",
  },
  "Independent Living": {
    description: "Low care residents → early intervention = new patients",
    play: "Ask for front desk + community director",
  },
  "Rehab Hospital": {
    description: "3+ hrs PT/OT daily → discharge home with home health",
    play: "Ask for case manager or discharge planner",
  },
  LTACH: {
    description: "Vent/wound patients → step down to SNF or home health",
    play: "Ask for case manager handling discharges",
  },
  "Wound Clinic": {
    description: "Chronic wounds → recurring skilled nursing referrals",
    play: "Ask provider about home wound care follow-up",
  },
  "Primary Care Office": {
    description: "Controls patient care → consistent referral source",
    play: "Build relationship with front desk + provider",
  },
  "Cardiology Office": {
    description: "CHF/post-cardiac → frequent home health needs",
    play: "Ask about patients needing monitoring at home",
  },
  "Orthopedic Office": {
    description: "Post-surgery → PT + home health referrals",
    play: "Ask about post-op discharge support",
  },
  "Podiatry Office": {
    description: "Foot wounds/diabetes → high SN referrals",
    play: "Ask about wound care at home",
  },
  "Nephrology Office": {
    description: "Dialysis patients → high-risk, frequent HH needs",
    play: "Ask about unstable patients needing support",
  },
  "Pulmonology Office": {
    description: "COPD/oxygen → recurring SN referrals",
    play: "Ask about patients struggling at home",
  },
  "Oncology Office": {
    description: "Weak/immunocompromised → SN support at home",
    play: "Ask about patients needing home monitoring",
  },
  "Pain Management": {
    description: "Chronic pain → PT + monitoring needs",
    play: "Ask about mobility or safety concerns",
  },
  "Neurology Office": {
    description: "Stroke/neuro → strong PT/OT referrals",
    play: "Ask about post-stroke patients",
  },
  "Internal Medicine": {
    description: "Primary adult care → steady referral base",
    play: "Build long-term referral relationship",
  },
  Geriatrics: {
    description: "Elderly patients → ideal HH pipeline",
    play: "Ask about patients declining at home",
  },
  Hospice: {
    description: "End-of-life → relationship-driven referrals",
    play: "Build relationship for future transitions",
  },
  "Dialysis Center": {
    description: "Frequent visits → high comorbidity patients",
    play: "Ask about patients struggling between treatments",
  },
  "Case Management Office": {
    description: "Controls discharges → key referral source",
    play: "Build direct relationship with case managers",
  },
  "Home Visit Physician Group": {
    description: "Sees homebound patients → direct HH referrals",
    play: "Partner for immediate referrals",
  },
  Other: {
    description: "Misc facility → evaluate opportunity",
    play: "Ask who handles patient care decisions",
  },
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

/** Expected visit cadence for territory planning (drives “next due” when follow-up is blank). */
export const VISIT_FREQUENCY_OPTIONS = ["weekly", "biweekly", "monthly"] as const;

export type VisitFrequencyOption = (typeof VISIT_FREQUENCY_OPTIONS)[number];

export function formatVisitFrequencyLabel(v: string | null | undefined): string {
  if (!v) return "—";
  if (v === "weekly") return "Weekly";
  if (v === "biweekly") return "Biweekly";
  if (v === "monthly") return "Monthly";
  return v;
}

export function isValidVisitFrequency(v: string): v is VisitFrequencyOption {
  return (VISIT_FREQUENCY_OPTIONS as readonly string[]).includes(v);
}

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
