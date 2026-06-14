export const FACILITY_RELATIONSHIP_STATUSES = [
  "New",
  "Cold",
  "Warm",
  "Good",
  "Strong",
  "Dormant",
  "Not Interested",
  "Do Not Contact",
] as const;
export type FacilityRelationshipStatus = (typeof FACILITY_RELATIONSHIP_STATUSES)[number];

export const FACILITY_PROFILE_REFERRAL_POTENTIALS = [
  "Cold",
  "Warm",
  "Hot",
  "Active Producer",
  "Not Interested",
] as const;
export type FacilityProfileReferralPotential = (typeof FACILITY_PROFILE_REFERRAL_POTENTIALS)[number];

export const FACILITY_PREFERRED_METHODS = [
  "phone",
  "fax",
  "email",
  "portal",
  "in_person",
  "unknown",
] as const;
export type FacilityPreferredMethod = (typeof FACILITY_PREFERRED_METHODS)[number];

export type FacilityReferralProfileRow = {
  id: string;
  facility_id: string;
  relationship_status: string | null;
  referral_potential: string | null;
  best_contact_id: string | null;
  referral_process: string | null;
  preferred_contact_method: string | null;
  preferred_packet_method: string | null;
  preferred_referral_method: string | null;
  referral_fax: string | null;
  referral_email: string | null;
  referral_phone: string | null;
  services_likely_to_refer: string[] | null;
  payer_notes: string | null;
  insurance_notes: string | null;
  decision_maker_name: string | null;
  decision_maker_role: string | null;
  gatekeeper_notes: string | null;
  objections: string | null;
  opportunities: string | null;
  next_best_action: string | null;
  next_best_action_due_at: string | null;
  last_profile_ai_summary: string | null;
  ai_confidence: number | null;
  profile_json: Record<string, unknown> | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FacilityReferralProfileContact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  fax: string | null;
  is_best_contact: boolean;
  is_decision_maker: boolean;
  is_gatekeeper: boolean;
  is_referral_contact: boolean;
  preferred_contact_method: string | null;
};

export type FacilityOpenActionItem = {
  key: string;
  label: string;
  count?: number;
  href?: string | null;
};

export type FacilityNextBestAction = {
  action: string;
  reason: string;
  due_at: string | null;
  source: "deterministic" | "profile" | "ai";
};

export type FacilityLastMeaningfulActivity = {
  id: string;
  activity_at: string;
  activity_type: string;
  outcome: string | null;
  summary: string;
};

export type FacilityReferralProfileSummary = {
  profile: FacilityReferralProfileRow;
  best_contact: FacilityReferralProfileContact | null;
  open_action_items: FacilityOpenActionItem[];
  next_best_action: FacilityNextBestAction | null;
  last_meaningful_activity: FacilityLastMeaningfulActivity | null;
  completeness_pct: number;
  /** Compact hints for outreach cards */
  hints: {
    best_contact_name: string | null;
    preferred_method: string | null;
    next_best_action: string | null;
    referral_potential: string | null;
    relationship_status: string | null;
  };
  /** Walk-in context bullets */
  walk_in_bullets: string[];
};

export type FacilityReferralProfileUpdateInput = Partial<
  Pick<
    FacilityReferralProfileRow,
    | "relationship_status"
    | "referral_potential"
    | "best_contact_id"
    | "referral_process"
    | "preferred_contact_method"
    | "preferred_packet_method"
    | "preferred_referral_method"
    | "referral_fax"
    | "referral_email"
    | "referral_phone"
    | "services_likely_to_refer"
    | "payer_notes"
    | "insurance_notes"
    | "decision_maker_name"
    | "decision_maker_role"
    | "gatekeeper_notes"
    | "objections"
    | "opportunities"
    | "next_best_action"
    | "next_best_action_due_at"
  >
>;

export type FacilityReferralProfileAiSuggestion = {
  relationship_status: string | null;
  referral_potential: string | null;
  best_contact_name: string | null;
  best_contact_role: string | null;
  referral_process: string | null;
  preferred_referral_method: string | null;
  preferred_packet_method: string | null;
  preferred_contact_method: string | null;
  referral_fax: string | null;
  referral_email: string | null;
  referral_phone: string | null;
  services_likely_to_refer: string[];
  payer_notes: string | null;
  insurance_notes: string | null;
  decision_maker_name: string | null;
  decision_maker_role: string | null;
  gatekeeper_notes: string | null;
  objections: string | null;
  opportunities: string | null;
  next_best_action: string | null;
  next_best_action_due_at: string | null;
  confidence: number;
};

export type FacilityReferralProfileAiEvidence = {
  source: string;
  date: string | null;
  summary: string;
};

export type FacilityReferralProfileIntelligenceRow = {
  facility_id: string;
  facility_name: string;
  completeness_pct: number;
  referral_potential: string | null;
  best_contact_name: string | null;
  preferred_method: string | null;
  next_best_action: string | null;
  relationship_status: string | null;
  updated_at: string | null;
};

export type ReferralProfileUpdateFromActivityPrompt = {
  referral_process: string | null;
  preferred_referral_method: string | null;
  best_contact_name: string | null;
  referral_fax: string | null;
  referral_email: string | null;
  referral_phone: string | null;
};
