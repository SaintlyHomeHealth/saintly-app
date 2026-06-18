import "server-only";

import { detectResumeDiscipline } from "@/lib/recruiting/resume-discipline-detect";
import { extractCandidateName } from "@/lib/recruiting/resume-name-extract";
import { extractResumeLocation } from "@/lib/recruiting/resume-location-extract";
import {
  extractCertificationsSection,
  extractCredentialTokens,
  extractEducationSection,
  extractLabeledSpecialties,
  extractSkillsSection,
  extractSummarySection,
  extractYearsExperience,
} from "@/lib/recruiting/resume-profile-sections";
import {
  flattenResumeTextForRegex,
  normalizeResumeTextForParsing,
} from "@/lib/recruiting/resume-text-normalize";
import type {
  ParsedResumeSuggestions,
  ResumeParseConfidence,
  ResumeParserDebug,
  ResumeParserFieldDebug,
  SuggestedResumeField,
} from "./resume-parse-types";
import { confidenceToLabel, emptyParserFieldDebug, fieldToParserDebug } from "./resume-parse-types";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

const PHONE_RES = [
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
  /\b\d{3}\s+\d{3}\s+\d{4}\b/g,
];

export type ParseResumePlainTextOptions = {
  /** PDF/DOC text layer when OCR text is merged into rawText */
  directText?: string;
  ocrText?: string;
};

function sf(
  value: string,
  confidence: ResumeParseConfidence,
  note?: string
): SuggestedResumeField | undefined {
  const v = value.trim();
  if (!v) return undefined;
  return { value: v, confidence, label: confidenceToLabel(confidence), ...(note ? { note } : {}) };
}

function extractEmail(text: string): SuggestedResumeField | undefined {
  const m = text.match(EMAIL_RE);
  if (!m?.[0]) return undefined;
  return sf(m[0], "high", "Contact block") ?? undefined;
}

function formatUsPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return digits;
}

function extractPhone(text: string): SuggestedResumeField | undefined {
  for (const re of PHONE_RES) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m?.[0]) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length >= 10) {
        const core = digits.length > 10 ? digits.slice(-10) : digits.slice(0, 10);
        return sf(formatUsPhoneDigits(core), "high", "Contact block") ?? undefined;
      }
    }
  }
  return undefined;
}

function mergeCertifications(
  section?: SuggestedResumeField,
  tokens?: SuggestedResumeField
): SuggestedResumeField | undefined {
  const parts = [section?.value, tokens?.value].filter(Boolean);
  if (!parts.length) return section ?? tokens;
  const value = [...new Set(parts.join(", ").split(/,\s*/))].filter(Boolean).slice(0, 16).join(", ");
  const confidence: ResumeParseConfidence =
    section?.confidence === "high" || tokens?.confidence === "high"
      ? "high"
      : section?.confidence === "medium" || tokens?.confidence === "medium"
        ? "medium"
        : "low";
  return sf(value, confidence, section?.note ?? tokens?.note ?? "Credentials / licenses");
}

export type ResumeParseMeta = {
  parseNotes: string[];
  parserDebug?: ResumeParserDebug;
};

export function parseResumePlainText(
  rawText: string,
  options?: ParseResumePlainTextOptions
): ParsedResumeSuggestions & { _meta?: ResumeParseMeta } {
  const { raw, cleaned } = normalizeResumeTextForParsing(rawText);
  const flat = flattenResumeTextForRegex(cleaned);
  if (flat.length < 15) {
    return {};
  }

  const out: ParsedResumeSuggestions & { _meta?: ResumeParseMeta } = {};
  const parseNotes: string[] = [];
  const extractOpts = { directText: options?.directText, ocrText: options?.ocrText };

  const email = extractEmail(flat);
  if (email) out.email = email;

  const phone = extractPhone(flat);
  if (phone) out.phone = phone;

  const names = extractCandidateName(raw, extractOpts);
  if (names.full) out.full_name = names.full;
  if (names.first) out.first_name = names.first;
  if (names.last) out.last_name = names.last;

  const location = extractResumeLocation(raw, extractOpts);
  if (location.city) out.city = location.city;
  if (location.state) out.state = location.state;
  if (location.zip) out.zip = location.zip;
  if (location.coverage_area) out.coverage_area = location.coverage_area;
  if (location.debug.locationWarning) {
    parseNotes.push(location.debug.locationWarning);
  }

  const disc = detectResumeDiscipline(cleaned, flat);
  if (disc && disc.confidence !== "low") {
    out.discipline = sf(disc.value, disc.confidence, disc.parseNote);
    parseNotes.push(disc.parseNote);
  } else if (disc?.confidence === "low") {
    parseNotes.push(`${disc.parseNote} (low confidence — left blank)`);
  }

  const yrs = extractYearsExperience(flat);
  if (yrs) out.years_of_experience = yrs;

  const education = extractEducationSection(cleaned);
  if (education) out.education = education;

  const skills = extractSkillsSection(cleaned);
  if (skills) out.skills = skills;

  const certSection = extractCertificationsSection(cleaned);
  const credTokens = extractCredentialTokens(cleaned);
  const certifications = mergeCertifications(certSection, credTokens);
  if (certifications) out.certifications = certifications;

  const spec = extractLabeledSpecialties(cleaned);
  if (spec) out.specialties = spec;

  const summary = extractSummarySection(cleaned);
  if (summary) out.notes_summary = summary;

  const disciplineDebug: ResumeParserFieldDebug = disc
    ? {
        value: out.discipline?.value ?? disc.value,
        confidence: out.discipline?.confidence ?? disc.confidence,
        source: out.discipline?.note ?? disc.parseNote,
      }
    : emptyParserFieldDebug();

  const parserDebug: ResumeParserDebug = {
    parsedName: names.debug.parsedName,
    nameConfidence: names.debug.confidence,
    nameSource: names.debug.source,
    phone: fieldToParserDebug(phone),
    email: fieldToParserDebug(email),
    city: location.debug.city,
    state: location.debug.state,
    zip: location.debug.zip,
    coverageArea: location.debug.coverageArea,
    discipline: disciplineDebug,
    credentials: certifications?.value ?? credTokens?.value ?? certSection?.value ?? null,
    skills: skills?.value ?? null,
    yearsOfExperience: yrs?.value ?? null,
    education: education?.value ?? null,
    rejectedCandidates: location.debug.rejectedCandidates,
    locationWarning: location.debug.locationWarning,
  };

  out._meta = { parseNotes, parserDebug };

  return out;
}
