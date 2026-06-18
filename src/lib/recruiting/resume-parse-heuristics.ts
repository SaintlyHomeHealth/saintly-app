import "server-only";

import { detectResumeDiscipline } from "@/lib/recruiting/resume-discipline-detect";
import {
  flattenResumeTextForRegex,
  normalizeResumeTextForParsing,
} from "@/lib/recruiting/resume-text-normalize";
import type { ParsedResumeSuggestions, ResumeParseConfidence, SuggestedResumeField } from "./resume-parse-types";
import { confidenceToLabel } from "./resume-parse-types";

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

const PHONE_RES = [
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
  /\b\d{3}\s+\d{3}\s+\d{4}\b/g,
];

const SKIP_NAME_LINE = /resume|curriculum|vitae|cv\b|phone|email|objective|summary|experience|education|skills|linkedin|http|www|\d{3}[-.\s]?\d{3}/i;

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
  return sf(m[0], "high") ?? undefined;
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
        return sf(formatUsPhoneDigits(core), "high") ?? undefined;
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

  for (let i = 0; i < Math.min(lines.length - 1, 10); i++) {
    const a = lines[i]!;
    const b = lines[i + 1]!;
    if (a.length < 2 || b.length < 2 || a.length > 55 || b.length > 55) continue;
    if (SKIP_NAME_LINE.test(a) || SKIP_NAME_LINE.test(b)) continue;
    if (EMAIL_RE.test(a) || EMAIL_RE.test(b)) continue;
    if (/\d{3}[-.\s]?\d{3}/.test(a) || /\d{3}[-.\s]?\d{3}/.test(b)) continue;
    const wa = a.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w));
    const wb = b.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w));
    if (wa.length !== 1 || wb.length !== 1) continue;
    const firstW = wa[0]!;
    const lastW = wb[0]!;
    if (firstW.length < 2 || lastW.length < 2) continue;
    if (/^(skills|education|experience|employment|work|summary|contact|objective|profile)$/i.test(a)) continue;
    const fullName = `${firstW} ${lastW}`;
    const full = sf(fullName, "low");
    const fi = sf(firstW, "low");
    const la = sf(lastW, "low");
    if (full && fi && la) return { full, first: fi, last: la };
  }

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

    return { full, first: fi, ...(la ? { last: la } : {}) };
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
      if (c && s) return { city: c, state: s };
    }
  }
  return {};
}

function extractYearsExperience(text: string): SuggestedResumeField | undefined {
  const m = text.match(/\b(\d{1,2})\+?\s*(?:years?|yrs\.?)\s+(?:of\s+)?(?:experience|exp\.?|in\s+nursing)\b/i);
  if (m?.[1]) return sf(`${m[1]}+ years`, "low") ?? undefined;
  const m2 = text.match(/\b(\d{1,2})\+?\s*yrs\b/i);
  if (m2?.[1]) return sf(`${m2[1]}+ years`, "low") ?? undefined;
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
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !SKIP_NAME_LINE.test(l) && !EMAIL_RE.test(l))
    .slice(0, 40)
    .join("\n");

  const chunk = cleaned.replace(/\s+/g, " ").trim().slice(0, 900);
  if (chunk.length < 40) return undefined;
  return sf(chunk.slice(0, 680), "low") ?? undefined;
}

export type ResumeParseMeta = {
  parseNotes: string[];
};

export function parseResumePlainText(rawText: string): ParsedResumeSuggestions & { _meta?: ResumeParseMeta } {
  const { raw, cleaned } = normalizeResumeTextForParsing(rawText);
  const flat = flattenResumeTextForRegex(cleaned);
  if (flat.length < 15) {
    return {};
  }

  const out: ParsedResumeSuggestions & { _meta?: ResumeParseMeta } = {};
  const parseNotes: string[] = [];

  const email = extractEmail(flat);
  if (email) out.email = email;

  const phone = extractPhone(flat);
  if (phone) out.phone = phone;

  const names = extractNameFromTop(raw);
  if (names.full) out.full_name = names.full;
  if (names.first) out.first_name = names.first;
  if (names.last) out.last_name = names.last;

  const cs = extractCityState(flat);
  if (cs.city) out.city = cs.city;
  if (cs.state) out.state = cs.state;

  const disc = detectResumeDiscipline(cleaned, flat);
  if (disc && disc.confidence !== "low") {
    out.discipline = sf(disc.value, disc.confidence, disc.parseNote);
    parseNotes.push(disc.parseNote);
  } else if (disc?.confidence === "low") {
    parseNotes.push(`${disc.parseNote} (low confidence — left blank)`);
  }

  const yrs = extractYearsExperience(flat);
  if (yrs) out.years_of_experience = yrs;

  const spec = extractLabeledSection(cleaned, /(?:^|\n)\s*specialties?:\s*(.+)/i);
  if (spec) {
    const s = sf(spec, "low");
    if (s) out.specialties = s;
  }

  const cert = extractLabeledSection(cleaned, /(?:^|\n)\s*certifications?:\s*(.+)/i);
  if (cert) {
    const c = sf(cert, "low");
    if (c) out.certifications = c;
  }

  const summary = buildSummary(cleaned);
  if (summary) out.notes_summary = summary;

  if (parseNotes.length) out._meta = { parseNotes };

  return out;
}
