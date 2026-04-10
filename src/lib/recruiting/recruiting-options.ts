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
  "Attempted Contact",
  "Text Sent",
  "Waiting on Reply",
  "Spoke",
  "Interested",
  "Not Interested",
  "On Hold",
] as const;

export type RecruitingSourceOption = (typeof RECRUITING_SOURCE_OPTIONS)[number];
export type RecruitingDisciplineOption = (typeof RECRUITING_DISCIPLINE_OPTIONS)[number];
export type RecruitingStatusOption = (typeof RECRUITING_STATUS_OPTIONS)[number];

export function isValidRecruitingSource(v: string): v is RecruitingSourceOption {
  return (RECRUITING_SOURCE_OPTIONS as readonly string[]).includes(v);
}

export function isValidRecruitingDiscipline(v: string): v is RecruitingDisciplineOption {
  return (RECRUITING_DISCIPLINE_OPTIONS as readonly string[]).includes(v);
}

export function isValidRecruitingStatus(v: string): v is RecruitingStatusOption {
  return (RECRUITING_STATUS_OPTIONS as readonly string[]).includes(v);
}

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
