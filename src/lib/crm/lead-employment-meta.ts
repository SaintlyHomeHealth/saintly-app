/**
 * `leads.external_source_metadata.employment_application` — set by employment intake API.
 */

export type EmploymentApplicationMeta = {
  submitted_at?: string | null;
  position?: string | null;
  license_number?: string | null;
  years_experience?: string | null;
  preferred_hours?: string | null;
  available_start_date?: string | null;
  experience_message?: string | null;
  resume_url?: string | null;
};

export function parseEmploymentApplicationMeta(external: unknown): EmploymentApplicationMeta | null {
  if (!external || typeof external !== "object") return null;
  const root = external as Record<string, unknown>;
  const emp = root.employment_application;
  if (!emp || typeof emp !== "object") return null;
  const e = emp as Record<string, unknown>;
  const str = (k: string) => (typeof e[k] === "string" ? e[k] : null);
  return {
    submitted_at: str("submitted_at"),
    position: str("position"),
    license_number: str("license_number"),
    years_experience: str("years_experience"),
    preferred_hours: str("preferred_hours"),
    available_start_date: str("available_start_date"),
    experience_message: str("experience_message"),
    resume_url: str("resume_url"),
  };
}
