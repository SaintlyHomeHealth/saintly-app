export type ReferralSourceReviewStatus = "needs_review" | "reviewed" | "all";

export type ReferralSourceReviewMarkReason =
  | "patient_self_referral"
  | "family_caregiver_referral"
  | "unknown_source"
  | "bad_office_info"
  | "spam_invalid"
  | "other";

export const REFERRAL_SOURCE_REVIEW_MARK_REASONS: Array<{
  value: ReferralSourceReviewMarkReason;
  label: string;
}> = [
  { value: "patient_self_referral", label: "Patient self-referral" },
  { value: "family_caregiver_referral", label: "Family/caregiver referral" },
  { value: "unknown_source", label: "Unknown source" },
  { value: "bad_office_info", label: "Bad office info" },
  { value: "spam_invalid", label: "Spam/invalid" },
  { value: "other", label: "Other" },
];

export type ReferralSourceReviewSuggestionContact = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
};

export type ReferralSourceReviewSuggestion = {
  facility_id: string;
  facility_name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  match_confidence: number;
  match_reasons: string[];
  match_badge: "strong" | "possible" | "weak";
  contacts: ReferralSourceReviewSuggestionContact[];
  last_activity_at: string | null;
  referral_potential: string | null;
  profile_status: string | null;
};

export type ReferralSourceReviewTypedSource = {
  referring_office_name: string | null;
  referring_contact_name: string | null;
  referring_contact_phone: string | null;
  referring_contact_email: string | null;
  office_city: string | null;
  office_phone: string | null;
  source_url: string | null;
  token: string | null;
  link_type: string | null;
  campaign_id: string | null;
  packet_request_id: string | null;
};

export type ReferralSourceReviewItem = {
  lead_id: string;
  patient_name: string;
  phone: string | null;
  service_needed: string | null;
  payer: string | null;
  created_at: string;
  status: string;
  referral_source_type: string | null;
  needs_referral_source_review: boolean;
  match_confidence: number | null;
  match_reason: string | null;
  typed_source: ReferralSourceReviewTypedSource;
  suggestions: ReferralSourceReviewSuggestion[];
  reviewed_at: string | null;
  reviewed_by_label: string | null;
  manual_facility_match: boolean;
  review_outcome: string | null;
};

export type ReferralSourceReviewSummary = {
  pending: number;
  reviewed: number;
  matchedAfterReview: number;
  facilitiesCreatedFromReview: number;
  avgHoursToReview: number | null;
  topUnmatchedOfficeNames: Array<{ name: string; count: number }>;
};
