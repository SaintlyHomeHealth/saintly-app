import "server-only";

import type { ResumeParseConfidence, SuggestedResumeField } from "@/lib/recruiting/resume-parse-types";
import { confidenceToLabel } from "@/lib/recruiting/resume-parse-types";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

const PHONE_IN_LINE = /\d{3}[-.\s]?\d{3}/;

const RESUME_SECTION_RE =
  /^(?:summary|objective|profile|contact|education|skills?|experience|work experience|employment|professional experience|certifications?|licenses?|references?)\b/i;

const SKIP_NAME_LINE =
  /resume|curriculum|vitae|cv\b|phone|email|objective|summary|experience|education|skills|linkedin|http|www|\d{3}[-.\s]?\d{3}/i;

/** Whole-word tokens that must never appear in a parsed person name. */
const NAME_REJECT_TOKEN =
  /^(?:college|university|school|institute|academy|bachelor|master|associate|science|nursing|methodist|education|degree|bsn|msn|pmhnp|rn|lpn|cna|pta|pt|ot|st|hha|graduate|student|licensed|therapist|assistant|nurse|department|health|medical|center|hospital|clinic)$/i;

/** Substring hints for institutions, degrees, and credentials in a candidate line. */
const NAME_REJECT_LINE =
  /\b(?:college|university|school|institute|academy|bachelor|master|associate|science|nursing|methodist|education|degree|bsn|msn|pmhnp|rn|lpn|cna|pta|pt|ot|st|hha)\b/i;

const JOB_TITLE_LINE =
  /\b(?:graduate|student|therapist|nurse|nursing|assistant|director|manager|coordinator|specialist|supervisor|intern|licensed|registered|pathologist|technician|aide|caregiver|provider|consultant|instructor|professor|faculty|dean|officer|analyst|engineer|developer|administrator)\b/i;

const HEADER_MAX_LINES = 15;
const TOP_PAGE_FRACTION = 0.25;

export type ResumeNameParseDebug = {
  parsedName: string | null;
  confidence: ResumeParseConfidence | null;
  source: string | null;
};

export type NameExtractResult = {
  full?: SuggestedResumeField;
  first?: SuggestedResumeField;
  last?: SuggestedResumeField;
  debug: ResumeNameParseDebug;
};

type NameCandidate = {
  fullName: string;
  first: string;
  last: string;
  confidence: ResumeParseConfidence;
  source: string;
  score: number;
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

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function isSectionHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (RESUME_SECTION_RE.test(t)) return true;
  if (
    t.length >= 4 &&
    t.length <= 42 &&
    t === t.toUpperCase() &&
    /[A-Z]/.test(t) &&
    !/\d/.test(t) &&
    !EMAIL_RE.test(t) &&
    !PHONE_IN_LINE.test(t)
  ) {
    return true;
  }
  return false;
}

function findFirstSectionIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (isSectionHeading(lines[i]!)) return i;
  }
  return lines.length;
}

function headerLinesForText(text: string): string[] {
  const lines = splitLines(text);
  if (!lines.length) return [];
  const sectionIdx = findFirstSectionIndex(lines);
  const fractionCount = Math.max(3, Math.ceil(lines.length * TOP_PAGE_FRACTION));
  const end = Math.min(sectionIdx, HEADER_MAX_LINES, fractionCount);
  return lines.slice(0, end);
}

function findContactLineIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (EMAIL_RE.test(line) || PHONE_IN_LINE.test(line)) return i;
  }
  return -1;
}

function isAllCapsHeading(line: string): boolean {
  const t = line.trim();
  return t.length >= 4 && t.length <= 42 && t === t.toUpperCase() && /[A-Z]/.test(t) && !/\d/.test(t);
}

function isRejectedNameLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 4 || t.length > 90) return true;
  if (SKIP_NAME_LINE.test(t)) return true;
  if (EMAIL_RE.test(t) || PHONE_IN_LINE.test(t)) return true;
  if (/^[^A-Za-z]+$/.test(t)) return true;
  if (isSectionHeading(t)) return true;
  if (isAllCapsHeading(t)) return true;
  if (NAME_REJECT_LINE.test(t)) return true;
  if (JOB_TITLE_LINE.test(t)) return true;
  if (/[&/|,]/.test(t)) return true;
  return false;
}

function parseNameWords(line: string): { first: string; last: string; full: string } | null {
  const words = line.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w));
  if (words.length < 2 || words.length > 3) return null;
  if (words.some((w) => NAME_REJECT_TOKEN.test(w))) return null;
  if (NAME_REJECT_LINE.test(line)) return null;

  const first = words[0]!;
  const last = words.slice(1).join(" ");
  if (first.length < 2 || last.length < 2) return null;
  if (isRejectedNameLine(`${first} ${last}`)) return null;

  return { first, last, full: words.join(" ") };
}

function titleCaseScore(words: string[]): number {
  return words.every((w) => /^[A-Z]/.test(w) || w.length <= 3) ? 2 : 0;
}

function collectCandidatesFromHeader(headerLines: string[], sourceLabel: string): NameCandidate[] {
  const out: NameCandidate[] = [];
  if (!headerLines.length) return out;

  const contactIdx = findContactLineIndex(headerLines);
  const beforeContactEnd = contactIdx >= 0 ? contactIdx : Math.min(3, headerLines.length);

  for (let i = 0; i < beforeContactEnd; i++) {
    const line = headerLines[i]!;
    if (isRejectedNameLine(line)) continue;

    const parsed = parseNameWords(line);
    if (!parsed) {
      const next = headerLines[i + 1];
      if (next && !isRejectedNameLine(line) && !isRejectedNameLine(next)) {
        const wa = line.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w));
        const wb = next.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'.-]*$/.test(w));
        if (wa.length === 1 && wb.length === 1 && !NAME_REJECT_TOKEN.test(wa[0]!) && !NAME_REJECT_TOKEN.test(wb[0]!)) {
          const fullName = `${wa[0]!} ${wb[0]!}`;
          if (!NAME_REJECT_LINE.test(fullName)) {
            const nearContact = contactIdx >= 0 && contactIdx - i <= 4;
            out.push({
              fullName,
              first: wa[0]!,
              last: wb[0]!,
              confidence: nearContact ? "high" : "medium",
              source: nearContact ? `${sourceLabel} (two-line, near contact)` : `${sourceLabel} (two-line header)`,
              score: 80 + titleCaseScore([wa[0]!, wb[0]!]) + (nearContact ? 20 : 10) - i,
            });
          }
        }
      }
      continue;
    }

    const nearContact = contactIdx >= 0 && contactIdx - i <= 4;
    const atTop = i <= 2;
    const conf: ResumeParseConfidence = nearContact || (atTop && contactIdx >= 0) ? "high" : "medium";
    out.push({
      fullName: parsed.full,
      first: parsed.first,
      last: parsed.last,
      confidence: conf,
      source:
        nearContact || (atTop && contactIdx >= 0)
          ? `${sourceLabel} (header near contact)`
          : `${sourceLabel} (resume header)`,
      score: 90 + titleCaseScore(parsed.full.split(/\s+/)) + (nearContact ? 15 : 5) - i,
    });
  }

  for (let i = beforeContactEnd; i < headerLines.length; i++) {
    const line = headerLines[i]!;
    if (isRejectedNameLine(line)) continue;
    const parsed = parseNameWords(line);
    if (!parsed) continue;
    out.push({
      fullName: parsed.full,
      first: parsed.first,
      last: parsed.last,
      confidence: "medium",
      source: `${sourceLabel} (top header)`,
      score: 50 + titleCaseScore(parsed.full.split(/\s+/)) - i,
    });
  }

  return out;
}

function pickBestCandidate(candidates: NameCandidate[]): NameCandidate | null {
  const usable = candidates.filter((c) => c.confidence !== "low");
  if (!usable.length) return null;
  usable.sort((a, b) => b.score - a.score || (a.confidence === "high" ? -1 : 1));
  return usable[0] ?? null;
}

export type ExtractCandidateNameOptions = {
  /** PDF/DOC text layer (preferred for header name). */
  directText?: string;
  /** OCR text from page 1 when available. */
  ocrText?: string;
};

/**
 * Extract candidate name from resume header zones only.
 * Never reads lines at or after Education / Experience / Skills section headings.
 * Low-confidence fallback names are omitted (returns empty name fields).
 */
export function extractCandidateName(text: string, options?: ExtractCandidateNameOptions): NameExtractResult {
  const emptyDebug: ResumeNameParseDebug = { parsedName: null, confidence: null, source: null };
  const sources: { label: string; text: string }[] = [];

  const direct = options?.directText?.trim();
  const ocr = options?.ocrText?.trim();
  if (direct) sources.push({ label: "PDF text header", text: direct });
  if (ocr && ocr !== direct) sources.push({ label: "OCR page header", text: ocr });
  sources.push({ label: "Resume header", text: text });

  const seen = new Set<string>();
  const candidates: NameCandidate[] = [];

  for (const src of sources) {
    const key = src.text.slice(0, 400);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(...collectCandidatesFromHeader(headerLinesForText(src.text), src.label));
  }

  const best = pickBestCandidate(candidates);
  if (!best) {
    return { debug: emptyDebug };
  }

  const note = best.source;
  return {
    full: sf(best.fullName, best.confidence, note),
    first: sf(best.first, best.confidence, note),
    last: sf(best.last, best.confidence, note),
    debug: {
      parsedName: best.fullName,
      confidence: best.confidence,
      source: best.source,
    },
  };
}
