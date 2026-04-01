/**
 * Primary role string for credential / compliance logic — same source as employee directory (`roleDisplay`).
 * Uses only `applicants` columns that exist in production (no `role` column).
 *
 * Priority: position → discipline → position_applied → job_title → title → role_title → selected_role
 */
export type ApplicantRoleFields = {
  position?: string | null;
  discipline?: string | null;
  position_applied?: string | null;
  job_title?: string | null;
  title?: string | null;
  role_title?: string | null;
  selected_role?: string | null;
};

export function applicantRolePrimaryForCompliance(a: ApplicantRoleFields): string {
  const chain: Array<string | null | undefined> = [
    a.position,
    a.discipline,
    a.position_applied,
    a.job_title,
    a.title,
    a.role_title,
    a.selected_role,
  ];
  for (const v of chain) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}
