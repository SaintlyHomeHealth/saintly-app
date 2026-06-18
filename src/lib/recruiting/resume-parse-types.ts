/**
 * Shared types for resume parsing + apply flow (API + client).
 */

/** Outcome of upload → extract (optional OCR) → heuristics (API + new-from-resume UI). */
export type ResumeParseQuality =
  | "parsed_ok"
  | "limited_parse"
  | "needs_review"
  | "ocr_success"
  | "ocr_limited"
  | "manual";

/** How resume text was obtained at upload/re-parse time. */
export type ResumeExtractionMethod = "pdf_text" | "ocr" | "hybrid" | "manual";

export type ResumeParseConfidence = "high" | "medium" | "low";

/** Maps to UI: High confidence / Possible match / Review needed */
export type ResumeConfidenceLabel = "high" | "possible" | "review";

export type SuggestedResumeField = {
  value: string;
  confidence: ResumeParseConfidence;
  /** Derived label for pills */
  label: ResumeConfidenceLabel;
  /** Optional rationale (e.g. discipline detection) */
  note?: string;
};

export type ParsedResumeSuggestions = {
  full_name?: SuggestedResumeField;
  first_name?: SuggestedResumeField;
  last_name?: SuggestedResumeField;
  phone?: SuggestedResumeField;
  email?: SuggestedResumeField;
  city?: SuggestedResumeField;
  state?: SuggestedResumeField;
  zip?: SuggestedResumeField;
  coverage_area?: SuggestedResumeField;
  discipline?: SuggestedResumeField;
  notes_summary?: SuggestedResumeField;
  years_of_experience?: SuggestedResumeField;
  specialties?: SuggestedResumeField;
  certifications?: SuggestedResumeField;
  education?: SuggestedResumeField;
  skills?: SuggestedResumeField;
};

export type ResumeParserFieldDebug = {
  value: string | null;
  confidence: ResumeParseConfidence | null;
  source: string | null;
};

/** Admin-facing parser debug shown on resume import preview. */
export type ResumeParserDebug = {
  parsedName: string | null;
  nameConfidence: ResumeParseConfidence | null;
  nameSource: string | null;
  phone: ResumeParserFieldDebug;
  email: ResumeParserFieldDebug;
  city: ResumeParserFieldDebug;
  state: ResumeParserFieldDebug;
  zip: ResumeParserFieldDebug;
  coverageArea: ResumeParserFieldDebug;
  discipline: ResumeParserFieldDebug;
  credentials: string | null;
  skills: string | null;
  yearsOfExperience: string | null;
  education: string | null;
  rejectedCandidates: string[];
  locationWarning: string | null;
};

export type ApplyableResumeField =
  | "full_name"
  | "first_name"
  | "last_name"
  | "phone"
  | "email"
  | "city"
  | "state"
  | "zip"
  | "coverage_area"
  | "discipline"
  | "notes_summary"
  | "years_of_experience"
  | "specialties"
  | "certifications"
  | "education"
  | "skills";

export function confidenceToLabel(c: ResumeParseConfidence): ResumeConfidenceLabel {
  if (c === "high") return "high";
  if (c === "medium") return "possible";
  return "review";
}

export function emptyParserFieldDebug(): ResumeParserFieldDebug {
  return { value: null, confidence: null, source: null };
}

export function fieldToParserDebug(field?: SuggestedResumeField): ResumeParserFieldDebug {
  if (!field?.value) return emptyParserFieldDebug();
  return {
    value: field.value,
    confidence: field.confidence,
    source: field.note ?? null,
  };
}
