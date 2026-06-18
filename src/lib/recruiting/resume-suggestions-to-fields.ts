import type { ParsedResumeSuggestions } from "@/lib/recruiting/resume-parse-types";

export function pickResumeSuggestion(s?: { value: string } | undefined): string {
  return s?.value?.trim() ? s.value.trim() : "";
}

/**
 * Map parser output to recruiting candidate field strings (same shape as new-from-resume review form).
 */
export function parsedSuggestionsToResumeFields(s: ParsedResumeSuggestions | null): {
  full_name: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  zip: string;
  coverage_area: string;
  discipline: string;
  notes: string;
  specialties: string;
  source: string;
} {
  if (!s) {
    return {
      full_name: "",
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      city: "",
      state: "",
      zip: "",
      coverage_area: "",
      discipline: "",
      notes: "",
      specialties: "",
      source: "Resume Upload",
    };
  }

  const notesParts: string[] = [];
  const summary = pickResumeSuggestion(s.notes_summary);
  if (summary) notesParts.push(summary);
  const yrs = pickResumeSuggestion(s.years_of_experience);
  if (yrs) notesParts.push(`Experience: ${yrs}`);
  const education = pickResumeSuggestion(s.education);
  if (education) notesParts.push(`Education:\n${education}`);
  const cert = pickResumeSuggestion(s.certifications);
  if (cert) notesParts.push(`Certifications / licenses: ${cert}`);

  const fn = pickResumeSuggestion(s.first_name);
  const ln = pickResumeSuggestion(s.last_name);
  const combined = [fn, ln].filter(Boolean).join(" ");

  const skills = pickResumeSuggestion(s.skills);
  const specialties = [pickResumeSuggestion(s.specialties), skills].filter(Boolean).join("\n");

  return {
    full_name: pickResumeSuggestion(s.full_name) || combined,
    first_name: fn,
    last_name: ln,
    phone: pickResumeSuggestion(s.phone),
    email: pickResumeSuggestion(s.email),
    city: pickResumeSuggestion(s.city),
    state: pickResumeSuggestion(s.state),
    zip: pickResumeSuggestion(s.zip),
    coverage_area: pickResumeSuggestion(s.coverage_area),
    discipline: pickResumeSuggestion(s.discipline),
    notes: notesParts.join("\n\n"),
    specialties,
    source: "Resume Upload",
  };
}

/** Bulk auto-create: full name plus at least one contact channel. */
export function canBulkAutoCreateFromFields(fields: { full_name: string; phone: string; email: string }): boolean {
  const name = fields.full_name.trim();
  if (!name) return false;
  return Boolean(fields.phone.trim() || fields.email.trim());
}
