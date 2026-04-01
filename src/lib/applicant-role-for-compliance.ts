/**
 * Primary role string for credential / compliance logic — matches employee directory (`roleDisplay`).
 * Order: `position` → `role` → `discipline`. Does not use `position_applied` (stale in production).
 */
export type ApplicantRoleFields = {
  position?: string | null;
  role?: string | null;
  discipline?: string | null;
};

export function applicantRolePrimaryForCompliance(a: ApplicantRoleFields): string {
  const pos = String(a.position ?? "").trim();
  if (pos) return pos;
  const role = String(a.role ?? "").trim();
  if (role) return role;
  const disc = String(a.discipline ?? "").trim();
  if (disc) return disc;
  return "";
}
