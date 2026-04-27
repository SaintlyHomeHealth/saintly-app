/**
 * Applicant text fields used for compliance / credential rules.
 * `applicantRolePrimaryForCompliance` still uses the historic chain (position → discipline → type);
 * `mergeApplicantRoleHints` unions **all** non-empty fields — use that for requirement resolution.
 */
export type ApplicantRoleFields = {
  position?: string | null;
  primary_discipline?: string | null;
  type_of_position?: string | null;
  position_applied?: string | null;
  discipline?: string | null;
  job_title?: string | null;
  title?: string | null;
  role?: string | null;
  role_title?: string | null;
};

export function applicantRolePrimaryForCompliance(a: ApplicantRoleFields): string {
  const chain: Array<string | null | undefined> = [
    a.position,
    a.primary_discipline,
    a.type_of_position,
    a.discipline,
    a.position_applied,
    a.job_title,
    a.role,
  ];
  for (const v of chain) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}
