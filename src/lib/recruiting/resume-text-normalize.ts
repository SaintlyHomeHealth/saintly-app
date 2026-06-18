import "server-only";

const SECTION_HEADING =
  /^(experience|work experience|employment|professional experience|education|skills|licenses?|certifications?|summary|objective|profile|contact|references?)\b/i;

const PAGE_FOOTER = /^(page\s+\d+|\d+\s+of\s+\d+|-\s*\d+\s*-)$/i;

/** Common OCR character substitutions in credential tokens only (conservative). */
const OCR_CREDENTIAL_FIXES: [RegExp, string][] = [
  [/\b0TR\/L\b/gi, "OTR/L"],
  [/\b0TR\b/gi, "OTR"],
  [/\bRN\s*\/\s*BSN\b/gi, "RN BSN"],
];

const MAX_STORE_CHARS = 80_000;

export type NormalizedResumeText = {
  raw: string;
  cleaned: string;
};

function fixHyphenatedLineBreaks(text: string): string {
  return text.replace(/([A-Za-z])-\s*\n\s*([a-z])/g, "$1$2");
}

function collapseRepeatedShortLines(lines: string[]): string[] {
  const seen = new Map<string, number>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (line.length <= 40) {
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count > 2 && !SECTION_HEADING.test(line)) continue;
    }
    if (PAGE_FOOTER.test(line)) continue;
    out.push(line);
  }
  return out;
}

function joinBrokenLines(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const next = lines[i + 1];
    if (
      next &&
      line.length > 0 &&
      line.length < 72 &&
      !line.endsWith(".") &&
      !line.endsWith(":") &&
      !SECTION_HEADING.test(line) &&
      !SECTION_HEADING.test(next) &&
      /^[a-z]/.test(next) &&
      !/[@\d]/.test(line.slice(-8))
    ) {
      out.push(`${line} ${next}`);
      i++;
      continue;
    }
    out.push(line);
  }
  return out;
}

function normalizeBullets(text: string): string {
  return text
    .replace(/[•●▪◦·]/g, "• ")
    .replace(/\s{2,}•/g, "\n• ");
}

function applyOcrCredentialFixes(text: string): string {
  let out = text;
  for (const [re, rep] of OCR_CREDENTIAL_FIXES) {
    out = out.replace(re, rep);
  }
  return out;
}

/**
 * Normalize resume text for parsing while preserving structure (newlines).
 * Returns both raw (light cleanup) and cleaned (heuristic-ready) variants.
 */
export function normalizeResumeTextForParsing(input: string): NormalizedResumeText {
  const raw = input
    .replace(/\0/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/([a-zA-Z0-9._%+\-])\s+@\s+([a-zA-Z0-9.\-])/g, "$1@$2")
    .slice(0, MAX_STORE_CHARS);

  let cleaned = fixHyphenatedLineBreaks(raw);
  cleaned = applyOcrCredentialFixes(cleaned);
  cleaned = normalizeBullets(cleaned);

  const lines = cleaned
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  const deduped = collapseRepeatedShortLines(lines);
  const joined = joinBrokenLines(deduped);
  cleaned = joined.join("\n").slice(0, MAX_STORE_CHARS);

  return { raw, cleaned };
}

/** Single-line variant for regex fields that expect flattened text. */
export function flattenResumeTextForRegex(cleanedMultiline: string): string {
  return cleanedMultiline.replace(/\s+/g, " ").trim();
}
