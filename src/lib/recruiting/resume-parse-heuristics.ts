import "server-only";

import type { ParsedResumeSuggestions, ResumeParseConfidence, SuggestedResumeField } from "./resume-parse-types";
import { confidenceToLabel } from "./resume-parse-types";

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

/** Match longer tokens first (PTA before PT). */
const DISCIPLINE_RULES: { pattern: RegExp; value: string }[] = [
  { pattern: /\bPTA\b/i, value: "PT" },
  { pattern: /\bOTA\b/i, value: "OT" },
  { pattern: /\bLVN\b/i, value: "LPN" },
  { pattern: /\bLPN\b/i, value: "LPN" },
  { pattern: /\bRN\b/i, value: "RN" },
  { pattern: /\bCNA\b/i, value: "CNA" },
  { pattern: /\bHHA\b/i, value: "HHA" },
  { pattern: /\bMSW\b/i, value: "MSW" },
  { pattern: /\bSLP\b/i, value: "SLP" },
  { pattern: /\bPT\b/i, value: "PT" },
  { pattern: /\bOT\b/i, value: "OT" },
  { pattern: /\bST\b/i, value: "ST" },
];

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

const PHONE_RES = [
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
];

const SKIP_NAME_LINE = /resume|curriculum|vitae|cv\b|phone|email|objective|summary|experience|education|skills|linkedin|http|www|\d{3}[-.\s]?\d{3}/i;

function sf(value: string, confidence: ResumeParseConfidence): SuggestedResumeField | undefined {
  const v = value.trim();
  if (!v) return undefined;
  return { value: v, confidence, label: confidenceToLabel(confidence) };
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractEmail(text: string): SuggestedResumeField | undefined {
  const m = text.match(EMAIL_RE);
  if (!m?.[0]) return undefined;
  return sf(m[0], "high") ?? undefined;
}

function extractPhone(text: string): SuggestedResumeField | undefined {
  for (const re of PHONE_RES) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m?.[0]) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length >= 10) {
        return sf(m[0].trim(), "high") ?? undefined;
      }
    }
  }
  return undefined;
}

function extractNameFromTop(text: string): { full?: SuggestedResumeField; first?: SuggestedResumeField; last?: SuggestedResumeField } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 35);

  for (const line of lines) {
    if (line.length < 4 || line.length > 90) continue;
    if (SKIP_NAME_LINE.test(line)) continue;
    if (EMAIL_RE.test(line)) continue;
    if (/\d{3}[-.\s]?\d{3}/.test(line)) continue;
    if (/^[^A-Za-z]+$/.test(line)) continue;

    const words = line.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w));
    if (words.length < 2 || words.length > 5) continue;

    const titleCase = words.every((w) => /^[A-Z]/.test(w) || w.length <= 3);
    const conf: ResumeParseConfidence = titleCase ? "medium" : "low";
    const fullName = words.join(" ");
    const first = words[0]!;
    const last = words.slice(1).join(" ");

    const full = sf(fullName, conf);
    const fi = sf(first, conf);
    const la = last ? sf(last, conf) : undefined;
    if (!full || !fi) return {};

    return {
      full,
      first: fi,
      ...(la ? { last: la } : {}),
    };
  }

  return {};
}

function extractCityState(text: string): { city?: SuggestedResumeField; state?: SuggestedResumeField } {
  const head = text.slice(0, 3500);
  const re = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?),\s*([A-Z]{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const city = m[1]?.trim();
    const st = m[2]?.trim().toUpperCase();
    if (city && st && US_STATES.has(st)) {
      const c = sf(city, "medium");
      const s = sf(st, "medium");
      if (c && s) {
        return { city: c, state: s };
      }
    }
  }
  return {};
}

function extractDiscipline(text: string): SuggestedResumeField | undefined {
  const upper = text.toUpperCase();
  for (const { pattern, value } of DISCIPLINE_RULES) {
    pattern.lastIndex = 0;
    if (pattern.test(text) || pattern.test(upper)) {
      return sf(value, "medium") ?? undefined;
    }
  }
  return undefined;
}

function extractYearsExperience(text: string): SuggestedResumeField | undefined {
  const m = text.match(/\b(\d{1,2})\+?\s*(?:years?|yrs\.?)\s+(?:of\s+)?(?:experience|exp\.?|in\s+nursing)\b/i);
  if (m?.[1]) {
    return sf(`${m[1]}+ years`, "low") ?? undefined;
  }
  const m2 = text.match(/\b(\d{1,2})\+?\s*yrs\b/i);
  if (m2?.[1]) {
    return sf(`${m2[1]}+ years`, "low") ?? undefined;
  }
  return undefined;
}

function extractLabeledSection(text: string, label: RegExp): string | undefined {
  const m = text.match(label);
  if (!m?.[1]) return undefined;
  const line = m[1].trim().split(/\n/)[0]?.trim();
  if (!line || line.length < 2) return undefined;
  return line.slice(0, 400);
}

function buildSummary(text: string): SuggestedResumeField | undefined {
  const cleaned = text
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !SKIP_NAME_LINE.test(l) && !EMAIL_RE.test(l))
    .slice(0, 40)
    .join("\n");

  const chunk = normalizeWhitespace(cleaned).slice(0, 900);
  if (chunk.length < 40) return undefined;
  return sf(chunk.slice(0, 680), "low") ?? undefined;
}

export function parseResumePlainText(rawText: string): ParsedResumeSuggestions {
  const text = normalizeWhitespace(rawText.replace(/\0/g, " "));
  if (text.length < 15) {
    return {};
  }

  const out: ParsedResumeSuggestions = {};

  const email = extractEmail(text);
  if (email) out.email = email;

  const phone = extractPhone(text);
  if (phone) out.phone = phone;

  const names = extractNameFromTop(rawText);
  if (names.full) out.full_name = names.full;
  if (names.first) out.first_name = names.first;
  if (names.last) out.last_name = names.last;

  const cs = extractCityState(text);
  if (cs.city) out.city = cs.city;
  if (cs.state) out.state = cs.state;

  const disc = extractDiscipline(text);
  if (disc) out.discipline = disc;

  const yrs = extractYearsExperience(text);
  if (yrs) out.years_of_experience = yrs;

  const spec = extractLabeledSection(
    text,
    /(?:^|\n)\s*specialties?:\s*(.+)/i
  );
  if (spec) {
    const s = sf(spec, "low");
    if (s) out.specialties = s;
  }

  const cert = extractLabeledSection(
    text,
    /(?:^|\n)\s*certifications?:\s*(.+)/i
  );
  if (cert) {
    const c = sf(cert, "low");
    if (c) out.certifications = c;
  }

  const summary = buildSummary(rawText);
  if (summary) {
    out.notes_summary = summary;
  }

  return out;
}
