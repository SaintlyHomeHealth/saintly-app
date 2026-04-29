/**
 * Recruiting CRM: allowed values for filters and forms (keep aligned with app usage).
 */

export const RECRUITING_SOURCE_OPTIONS = ["Indeed", "Referral", "Website", "Other"] as const;

export const RECRUITING_DISCIPLINE_OPTIONS = [
  "RN",
  "LPN",
  "CNA",
  "PT",
  "OT",
  "ST",
  "HHA",
  "Other",
] as const;

export const RECRUITING_STATUS_OPTIONS = [
  "New",
  "Not Contacted",
  "Attempted Contact",
  "Text Sent",
  "Spoke",
  "Interested",
  "Maybe Later",
  "Follow Up Later",
  "Not Interested",
  "No Response",
  "Interviewing",
  "Onboarding",
  "Hired",
  "Archived",
] as const;

/** Legacy rows may still use these — keep selectable in forms. */
export const RECRUITING_STATUS_LEGACY_OPTIONS = ["Waiting on Reply", "On Hold"] as const;

export const RECRUITING_INTEREST_LEVEL_OPTIONS = ["hot", "warm", "cold", "maybe_later"] as const;

export const RECRUITING_PREFERRED_CONTACT_OPTIONS = ["call", "text", "email"] as const;

export type RecruitingSourceOption = (typeof RECRUITING_SOURCE_OPTIONS)[number];
export type RecruitingDisciplineOption = (typeof RECRUITING_DISCIPLINE_OPTIONS)[number];
export type RecruitingStatusOption = (typeof RECRUITING_STATUS_OPTIONS)[number];
export type RecruitingInterestLevelOption = (typeof RECRUITING_INTEREST_LEVEL_OPTIONS)[number];
export type RecruitingPreferredContactOption = (typeof RECRUITING_PREFERRED_CONTACT_OPTIONS)[number];

export function isValidRecruitingSource(v: string): v is RecruitingSourceOption {
  return (RECRUITING_SOURCE_OPTIONS as readonly string[]).includes(v);
}

export function isValidRecruitingDiscipline(v: string): v is RecruitingDisciplineOption {
  return (RECRUITING_DISCIPLINE_OPTIONS as readonly string[]).includes(v);
}

export function isValidRecruitingStatus(v: string): v is RecruitingStatusOption {
  return (RECRUITING_STATUS_OPTIONS as readonly string[]).includes(v);
}

export function isValidRecruitingInterestLevel(v: string): v is RecruitingInterestLevelOption {
  return (RECRUITING_INTEREST_LEVEL_OPTIONS as readonly string[]).includes(v);
}

export function isValidRecruitingPreferredContact(v: string): v is RecruitingPreferredContactOption {
  return (RECRUITING_PREFERRED_CONTACT_OPTIONS as readonly string[]).includes(v);
}

/**
 * Bulk resume upload: one selection applies to every file in that run session.
 * Stored on `recruiting_candidates.discipline` (parsed resume discipline is ignored when set).
 * Empty value keeps current behavior (parser may fill discipline).
 */
export const RECRUITING_BATCH_UPLOAD_DISCIPLINE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "Match resume (no override)" },
  { value: "RN", label: "RN" },
  { value: "LVN/LPN", label: "LVN/LPN" },
  { value: "PT", label: "PT" },
  { value: "PTA", label: "PTA" },
  { value: "OT", label: "OT" },
  { value: "COTA", label: "COTA" },
  { value: "ST", label: "ST" },
  { value: "MSW", label: "MSW" },
  { value: "HHA/CNA", label: "HHA/CNA" },
  { value: "Other", label: "Other / unspecified" },
];

/** Default SMS snippets for one-tap compose (Phoenix / Saintly context). */
export const RECRUITING_TEXT_TEMPLATES: { id: string; label: string; body: string }[] = [
  {
    id: "intro",
    label: "Intro",
    body: "Hi — this is Saintly Home Health. We saw your application and would love to connect about home health opportunities in your area. When is a good time for a quick call?",
  },
  {
    id: "followup",
    label: "Follow-up",
    body: "Hi — just following up on my message. Are you still interested in learning more about our clinician roles? Reply YES and I’ll call you today.",
  },
  {
    id: "shift",
    label: "Shifts",
    body: "Hi — we have flexible shifts across Maricopa County. Want me to share a few details and next steps?",
  },
];
