/**
 * Canonical applicant role string for credential / compliance (directory, dashboard, SMS, employee UI).
 * Matches live `public.applicants` columns only — no `role`, `discipline`, or `position_applied`.
 *
 * Priority: position → primary_discipline → type_of_position
 */
export type ApplicantRoleFields = {
  position?: string | null;
  primary_discipline?: string | null;
  type_of_position?: string | null;
};

export function applicantRolePrimaryForCompliance(a: ApplicantRoleFields): string {
  const chain: Array<string | null | undefined> = [
    a.position,
    a.primary_discipline,
    a.type_of_position,
  ];
  for (const v of chain) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}
