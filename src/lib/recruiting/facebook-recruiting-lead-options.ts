export const FACEBOOK_RECRUITING_LEAD_STATUS_OPTIONS = [
  "New",
  "Contacted",
  "Interview Scheduled",
  "Credentialing",
  "Hired",
  "Not Qualified",
  "No Response",
] as const;

export type FacebookRecruitingLeadStatus = (typeof FACEBOOK_RECRUITING_LEAD_STATUS_OPTIONS)[number];

export function isValidFacebookRecruitingLeadStatus(value: string): value is FacebookRecruitingLeadStatus {
  return (FACEBOOK_RECRUITING_LEAD_STATUS_OPTIONS as readonly string[]).includes(value);
}
