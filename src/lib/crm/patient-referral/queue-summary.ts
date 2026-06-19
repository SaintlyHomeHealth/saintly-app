import type { ParsedPatientReferralSuggestions } from "./types";
import type { PatientReferralUploadStatus } from "./types";

export type PatientReferralQueueSummary = {
  patientName: string | null;
  payer: string | null;
  socDate: string | null;
  authNumber: string | null;
};

export function summarizeParsedReferral(
  suggestions: ParsedPatientReferralSuggestions | null | undefined
): PatientReferralQueueSummary {
  if (!suggestions) {
    return { patientName: null, payer: null, socDate: null, authNumber: null };
  }
  const patientName =
    [suggestions.first_name, suggestions.last_name].filter(Boolean).join(" ").trim() ||
    suggestions.full_name?.trim() ||
    null;
  return {
    patientName,
    payer: suggestions.insurance_name?.trim() || null,
    socDate: suggestions.requested_soc_date?.trim() || suggestions.best_available_soc_date?.trim() || null,
    authNumber: suggestions.authorization_number?.trim() || null,
  };
}

export function deriveQueueStatusAfterParse(input: {
  parseAttempted: boolean;
  parse: { ok: boolean; needsReview?: boolean; suggestions: ParsedPatientReferralSuggestions | null } | null;
  error?: string;
}): PatientReferralUploadStatus {
  if (input.error) return "failed";
  if (!input.parseAttempted || !input.parse) return "uploading";
  if (input.parse.ok && !input.parse.needsReview) return "ready";
  if (input.parse.suggestions) return "needs_review";
  return "failed";
}

export function hasParseData(parse: { suggestions: ParsedPatientReferralSuggestions | null } | null | undefined): boolean {
  if (!parse?.suggestions) return false;
  const s = parse.suggestions;
  return Boolean(
    s.first_name ||
      s.last_name ||
      s.full_name ||
      s.phone ||
      s.authorization_number ||
      s.insurance_name ||
      s.requested_soc_date
  );
}
