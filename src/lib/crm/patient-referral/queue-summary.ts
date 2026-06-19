import type { ParsedPatientReferralSuggestions } from "./types";
import type { PatientReferralUploadStatus } from "./types";

export type PatientReferralQueueSummary = {
  patientName: string | null;
  payer: string | null;
  socDate: string | null;
  authNumber: string | null;
  snVisits: number | null;
};

export function formatReferralDateForDisplay(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const s = value.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return s;
}

export function hasMeaningfulParseData(
  suggestions: ParsedPatientReferralSuggestions | null | undefined
): boolean {
  if (!suggestions) return false;
  return Boolean(
    suggestions.first_name?.trim() ||
      suggestions.last_name?.trim() ||
      suggestions.full_name?.trim() ||
      suggestions.date_of_birth?.trim() ||
      suggestions.phone?.trim() ||
      suggestions.authorization_number?.trim()
  );
}

export function summarizeParsedReferral(
  suggestions: ParsedPatientReferralSuggestions | null | undefined
): PatientReferralQueueSummary {
  if (!suggestions) {
    return { patientName: null, payer: null, socDate: null, authNumber: null, snVisits: null };
  }
  const patientName =
    [suggestions.first_name, suggestions.last_name].filter(Boolean).join(" ").trim() ||
    suggestions.full_name?.trim() ||
    null;
  return {
    patientName,
    payer: suggestions.insurance_name?.trim() || null,
    socDate:
      formatReferralDateForDisplay(suggestions.requested_soc_date) ||
      formatReferralDateForDisplay(suggestions.best_available_soc_date) ||
      null,
    authNumber: suggestions.authorization_number?.trim() || null,
    snVisits: suggestions.skilled_nursing_visits ?? null,
  };
}

export function deriveQueueStatusAfterParse(input: {
  parseAttempted: boolean;
  parse: { ok: boolean; needsReview?: boolean; suggestions: ParsedPatientReferralSuggestions | null } | null;
  error?: string;
}): PatientReferralUploadStatus {
  if (input.error) return "failed";
  if (!input.parseAttempted || !input.parse) return "uploading";
  if (!hasMeaningfulParseData(input.parse.suggestions)) return "failed";
  if (input.parse.ok && !input.parse.needsReview) return "ready";
  return "needs_review";
}

/** @deprecated Use hasMeaningfulParseData */
export function hasParseData(parse: { suggestions: ParsedPatientReferralSuggestions | null } | null | undefined): boolean {
  return hasMeaningfulParseData(parse?.suggestions);
}
