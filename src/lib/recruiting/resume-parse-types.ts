/**
 * Shared types for resume parsing + apply flow (API + client).
 */

/** Outcome of upload → extract (optional OCR) → heuristics (API + new-from-resume UI). */
export type ResumeParseQuality =
  | "parsed_ok"
  | "limited_parse"
  | "ocr_success"
  | "ocr_limited"
  | "manual";

export type ResumeParseConfidence = "high" | "medium" | "low";

/** Maps to UI: High confidence / Possible match / Review needed */
export type ResumeConfidenceLabel = "high" | "possible" | "review";

export type SuggestedResumeField = {
  value: string;
  confidence: ResumeParseConfidence;
  /** Derived label for pills */
  label: ResumeConfidenceLabel;
};

export type ParsedResumeSuggestions = {
  full_name?: SuggestedResumeField;
  first_name?: SuggestedResumeField;
  last_name?: SuggestedResumeField;
  phone?: SuggestedResumeField;
  email?: SuggestedResumeField;
  city?: SuggestedResumeField;
  state?: SuggestedResumeField;
  discipline?: SuggestedResumeField;
  notes_summary?: SuggestedResumeField;
  years_of_experience?: SuggestedResumeField;
  specialties?: SuggestedResumeField;
  certifications?: SuggestedResumeField;
};

export type ApplyableResumeField =
  | "full_name"
  | "first_name"
  | "last_name"
  | "phone"
  | "email"
  | "city"
  | "state"
  | "discipline"
  | "notes_summary"
  | "years_of_experience"
  | "specialties"
  | "certifications";

export function confidenceToLabel(c: ResumeParseConfidence): ResumeConfidenceLabel {
  if (c === "high") return "high";
  if (c === "medium") return "possible";
  return "review";
}
