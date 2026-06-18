import "server-only";

import { lookupZipCityState, normalizeZip } from "@/lib/recruiting/resume-zip-lookup";
import type { ResumeParseConfidence, SuggestedResumeField } from "@/lib/recruiting/resume-parse-types";
import { confidenceToLabel } from "@/lib/recruiting/resume-parse-types";

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const FORBIDDEN_SECTION_RE =
  /^(?:education|experience|work experience|employment|professional experience|skills?|certifications?|licenses?|references?)\b/i;

const CONTACT_SECTION_RE = /^(?:contact|summary|objective|profile)\b/i;

const LOCATION_INSTITUTION_REJECT =
  /\b(?:college|university|school|institute|academy|hospital|medical center|health system|clinic|department|employer|methodist|nursing program|campus)\b/i;

const LOCATION_LABEL_RE =
  /\b(?:address|location|based in|lives in|residing in|residence|home address|mailing address)\s*[:\-]?\s*(.+)$/i;

const COVERAGE_LABEL_RE =
  /\b(?:coverage area|service area|serving|serve[s]?|areas served|willing to travel)\s*[:\-]?\s*(.+)$/i;

const METRO_COVERAGE_RE =
  /\b(greater phoenix|phoenix metro|east valley|west valley|maricopa county|central phoenix|north phoenix|south phoenix)\b/i;

const HEADER_MAX_LINES = 15;

export type ResumeLocationFieldDebug = {
  value: string | null;
  confidence: ResumeParseConfidence | null;
  source: string | null;
};

export type ResumeLocationExtractResult = {
  city?: SuggestedResumeField;
  state?: SuggestedResumeField;
  zip?: SuggestedResumeField;
  coverage_area?: SuggestedResumeField;
  debug: {
    city: ResumeLocationFieldDebug;
    state: ResumeLocationFieldDebug;
    zip: ResumeLocationFieldDebug;
    coverageArea: ResumeLocationFieldDebug;
    rejectedCandidates: string[];
    locationWarning: string | null;
  };
};

type LocationCandidate = {
  city: string;
  state: string;
  zip?: string;
  confidence: ResumeParseConfidence;
  source: string;
  score: number;
};

type CoverageCandidate = {
  value: string;
  confidence: ResumeParseConfidence;
  source: string;
  score: number;
};

function sf(value: string, confidence: ResumeParseConfidence, note?: string): SuggestedResumeField | undefined {
  const v = value.trim();
  if (!v) return undefined;
  return { value: v, confidence, label: confidenceToLabel(confidence), ...(note ? { note } : {}) };
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function isSectionHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (FORBIDDEN_SECTION_RE.test(t) || CONTACT_SECTION_RE.test(t)) return true;
  if (t.length >= 4 && t.length <= 42 && t === t.toUpperCase() && /[A-Z]/.test(t) && !/\d{5}/.test(t)) return true;
  return false;
}

function findFirstForbiddenSectionIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (FORBIDDEN_SECTION_RE.test(lines[i]!)) return i;
  }
  return lines.length;
}

function contactZoneText(text: string): string {
  const lines = splitLines(text);
  if (!lines.length) return "";
  const forbiddenIdx = findFirstForbiddenSectionIndex(lines);
  return lines.slice(0, Math.min(forbiddenIdx, HEADER_MAX_LINES)).join("\n");
}

function normalizeState(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  if (US_STATES.has(upper)) return upper;
  const fromName = STATE_NAME_TO_ABBR[t.toLowerCase()];
  return fromName && US_STATES.has(fromName) ? fromName : null;
}

function isRejectedLocationLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 3) return true;
  if (LOCATION_INSTITUTION_REJECT.test(t)) return true;
  if (/\b(?:bachelor|master|associate|degree|bsn|msn|gpa|graduated|student at)\b/i.test(t)) return true;
  return false;
}

function titleCaseCity(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function parseCityStateZipFromLine(line: string): Omit<LocationCandidate, "confidence" | "source" | "score"> | null {
  if (isRejectedLocationLine(line)) return null;

  const withZip = line.match(/\b([A-Za-z][A-Za-z\s'.-]{1,40}?)\s*,?\s*([A-Za-z]{2,20})\s+(\d{5})(?:-\d{4})?\b/);
  if (withZip) {
    const cityRaw = withZip[1]?.trim();
    const st = normalizeState(withZip[2] ?? "");
    const zip = normalizeZip(withZip[3] ?? "");
    if (cityRaw && st && zip.length === 5 && !isRejectedLocationLine(cityRaw)) {
      return { city: titleCaseCity(cityRaw), state: st, zip };
    }
  }

  const citySt = line.match(/\b([A-Za-z][A-Za-z\s'.-]{1,40}?)\s*,\s*([A-Za-z]{2,20})\b/);
  if (citySt) {
    const cityRaw = citySt[1]?.trim();
    const st = normalizeState(citySt[2] ?? "");
    if (cityRaw && st && !isRejectedLocationLine(cityRaw)) {
      const zipMatch = line.match(/\b(\d{5})(?:-\d{4})?\b/);
      const zip = zipMatch ? normalizeZip(zipMatch[1] ?? "") : undefined;
      return { city: titleCaseCity(cityRaw), state: st, ...(zip?.length === 5 ? { zip } : {}) };
    }
  }

  const cityOnlySt = line.match(/\b([A-Za-z][A-Za-z\s'.-]{1,40}?)\s+([A-Z]{2})\b/);
  if (cityOnlySt) {
    const cityRaw = cityOnlySt[1]?.trim();
    const st = normalizeState(cityOnlySt[2] ?? "");
    if (cityRaw && st && !isRejectedLocationLine(cityRaw) && !/\d{3}[-.\s]?\d{3}/.test(line)) {
      return { city: titleCaseCity(cityRaw), state: st };
    }
  }

  const zipOnly = line.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipOnly) {
    const zip = normalizeZip(zipOnly[1] ?? "");
    const lookup = lookupZipCityState(zip);
    if (lookup && !isRejectedLocationLine(line)) {
      return { city: lookup.city, state: lookup.state, zip };
    }
  }

  return null;
}

function enrichFromZip(candidate: LocationCandidate): LocationCandidate {
  if (!candidate.zip) return candidate;
  const lookup = lookupZipCityState(candidate.zip);
  if (!lookup) return candidate;
  let score = candidate.score;
  if (candidate.city.toLowerCase() === lookup.city.toLowerCase()) score += 10;
  else if (!candidate.city) {
    candidate.city = lookup.city;
    score += 8;
  }
  if (candidate.state === lookup.state) score += 5;
  else if (!candidate.state) {
    candidate.state = lookup.state;
    score += 5;
  }
  candidate.score = score;
  return candidate;
}

function collectLocationCandidates(zoneText: string, sourceLabel: string): LocationCandidate[] {
  const out: LocationCandidate[] = [];
  const lines = splitLines(zoneText);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const labelMatch = line.match(LOCATION_LABEL_RE);
    const searchLine = labelMatch?.[1]?.trim() || line;
    const parsed = parseCityStateZipFromLine(searchLine);
    if (!parsed) continue;

    const nearTop = i <= 4;
    out.push(
      enrichFromZip({
        ...parsed,
        confidence: labelMatch ? "high" : nearTop ? "high" : "medium",
        source: labelMatch
          ? `${sourceLabel} (labeled address)`
          : nearTop
            ? `${sourceLabel} (contact header)`
            : `${sourceLabel} (header)`,
        score: (labelMatch ? 100 : nearTop ? 90 : 70) - i,
      })
    );
  }

  return out;
}

function normalizeCoverageList(raw: string): string {
  return raw
    .replace(/\band\b/gi, ",")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestLocation(candidates: LocationCandidate[]): LocationCandidate | null {
  const usable = candidates.filter((c) => c.confidence !== "low");
  if (!usable.length) return null;
  usable.sort((a, b) => b.score - a.score);
  return usable[0] ?? null;
}

function extractCoverageArea(text: string): CoverageCandidate | null {
  const lines = splitLines(text);
  const candidates: CoverageCandidate[] = [];

  for (const line of lines) {
    const metro = line.match(METRO_COVERAGE_RE);
    if (metro?.[1]) {
      candidates.push({
        value: titleCaseCity(metro[1]),
        confidence: "medium",
        source: "Metro / region keyword",
        score: 70,
      });
    }

    const label = line.match(COVERAGE_LABEL_RE);
    if (label?.[1]) {
      const val = normalizeCoverageList(label[1]).slice(0, 240);
      if (val.length >= 3) {
        candidates.push({
          value: val,
          confidence: "high",
          source: "Labeled coverage / service area",
          score: 95,
        });
      }
    }

    const serving = line.match(/\bserving\s+(.+)/i);
    if (serving?.[1] && !FORBIDDEN_SECTION_RE.test(line)) {
      const val = normalizeCoverageList(serving[1]).slice(0, 240);
      if (val.length >= 3 && !LOCATION_INSTITUTION_REJECT.test(val)) {
        candidates.push({
          value: val,
          confidence: "medium",
          source: "Serving line",
          score: 80,
        });
      }
    }

    if (/\bwilling to travel\b/i.test(line)) {
      candidates.push({
        value: "Willing to travel",
        confidence: "medium",
        source: "Travel willingness",
        score: 50,
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

function collectRejectedLocationLines(text: string): string[] {
  const rejected: string[] = [];
  const lines = splitLines(text);
  let inForbidden = false;

  for (const line of lines) {
    if (FORBIDDEN_SECTION_RE.test(line)) {
      inForbidden = true;
      continue;
    }
    if (isSectionHeading(line) && !FORBIDDEN_SECTION_RE.test(line)) {
      inForbidden = false;
    }
    const parsed = parseCityStateZipFromLine(line);
    if (parsed && (inForbidden || isRejectedLocationLine(line))) {
      rejected.push(line.slice(0, 120));
    }
    if (isRejectedLocationLine(line) && /\b(?:,\s*[A-Z]{2}\b|\d{5}\b)/.test(line)) {
      rejected.push(line.slice(0, 120));
    }
  }

  return [...new Set(rejected)].slice(0, 12);
}

export type ExtractResumeLocationOptions = {
  directText?: string;
  ocrText?: string;
};

/**
 * Parse candidate contact location from header/contact zones only.
 * Never uses education or employment section addresses as current location.
 * Low-confidence locations are omitted from field output.
 */
export function extractResumeLocation(text: string, options?: ExtractResumeLocationOptions): ResumeLocationExtractResult {
  const emptyField = (): ResumeLocationFieldDebug => ({ value: null, confidence: null, source: null });
  const rejectedCandidates = collectRejectedLocationLines(text);

  const sources: { label: string; text: string }[] = [];
  const direct = options?.directText?.trim();
  const ocr = options?.ocrText?.trim();
  if (direct) sources.push({ label: "PDF text contact", text: direct });
  if (ocr && ocr !== direct) sources.push({ label: "OCR contact", text: ocr });
  sources.push({ label: "Contact header", text: text });

  const seen = new Set<string>();
  const locationCandidates: LocationCandidate[] = [];
  for (const src of sources) {
    const zone = contactZoneText(src.text);
    const key = zone.slice(0, 400);
    if (!zone || seen.has(key)) continue;
    seen.add(key);
    locationCandidates.push(...collectLocationCandidates(zone, src.label));
  }

  const best = pickBestLocation(locationCandidates);
  const coverage = extractCoverageArea(text);

  const debug = {
    city: emptyField(),
    state: emptyField(),
    zip: emptyField(),
    coverageArea: emptyField(),
    rejectedCandidates,
    locationWarning: null as string | null,
  };

  const out: ResumeLocationExtractResult = { debug };

  if (best && best.confidence !== "low") {
    out.city = sf(best.city, best.confidence, best.source);
    out.state = sf(best.state, best.confidence, best.source);
    if (best.zip) out.zip = sf(best.zip, best.confidence, best.source);
    debug.city = { value: best.city, confidence: best.confidence, source: best.source };
    debug.state = { value: best.state, confidence: best.confidence, source: best.source };
    if (best.zip) debug.zip = { value: best.zip, confidence: best.confidence, source: best.source };
  } else if (locationCandidates.some((c) => c.confidence === "low")) {
    debug.locationWarning = "Location could not be confidently parsed. Please review before saving.";
  }

  if (coverage && coverage.confidence !== "low") {
    out.coverage_area = sf(coverage.value, coverage.confidence, coverage.source);
    debug.coverageArea = {
      value: coverage.value,
      confidence: coverage.confidence,
      source: coverage.source,
    };
  }

  if (!out.city && !out.state && !out.zip && rejectedCandidates.length > 0) {
    debug.locationWarning ??= "Location could not be confidently parsed. Please review before saving.";
  }

  return out;
}
