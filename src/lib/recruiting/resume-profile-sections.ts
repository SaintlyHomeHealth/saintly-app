import "server-only";

import type { ResumeParseConfidence, SuggestedResumeField } from "@/lib/recruiting/resume-parse-types";
import { confidenceToLabel } from "@/lib/recruiting/resume-parse-types";

const SECTION_HEADING =
  /^(?:summary|objective|profile|contact|education|skills?|experience|work experience|employment|professional experience|certifications?|licenses?|references?)\b/i;

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

function findSectionRange(lines: string[], headingRe: RegExp): { start: number; end: number } | null {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i]!)) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (SECTION_HEADING.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function extractSectionBlock(text: string, headingRe: RegExp, maxChars = 1200): string | undefined {
  const lines = splitLines(text);
  const range = findSectionRange(lines, headingRe);
  if (!range) return undefined;
  const block = lines.slice(range.start, range.end).join("\n").trim();
  if (block.length < 3) return undefined;
  return block.slice(0, maxChars);
}

export function extractEducationSection(text: string): SuggestedResumeField | undefined {
  const block = extractSectionBlock(text, /^education\b/i);
  if (!block) return undefined;
  return sf(block, "medium", "Education section");
}

export function extractSkillsSection(text: string): SuggestedResumeField | undefined {
  const block = extractSectionBlock(text, /^skills?\b/i);
  if (!block) return undefined;
  return sf(block, "medium", "Skills section");
}

export function extractCertificationsSection(text: string): SuggestedResumeField | undefined {
  const cert = extractSectionBlock(text, /^certifications?\b/i, 800);
  const lic = extractSectionBlock(text, /^licenses?\b/i, 800);
  const combined = [cert, lic].filter(Boolean).join("\n").trim();
  if (!combined) return undefined;
  return sf(combined, "medium", "Certifications / licenses section");
}

export function extractSummarySection(text: string): SuggestedResumeField | undefined {
  const block =
    extractSectionBlock(text, /^(?:summary|professional summary|profile|objective)\b/i, 900) ??
    extractSectionBlock(text, /^about me\b/i, 900);
  if (!block || block.length < 25) return undefined;
  return sf(block.slice(0, 680), "medium", "Summary section");
}

const CREDENTIAL_TOKEN_RE =
  /\b(?:RN|LPN|LVN|CNA|PTA|PT|OT|ST|MSW|LCSW|LMSW|HHA|BSN|MSN|PMHNP|DNP|CCRN|ACLS|BLS|PALS|NRP|CPR|AZRN|AZ\s*RN|Licensed\s+(?:RN|LPN|PT|OT|ST|MSW))\b/gi;

export function extractCredentialTokens(text: string): SuggestedResumeField | undefined {
  const head = text.slice(0, 4500);
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CREDENTIAL_TOKEN_RE.source, "gi");
  while ((m = re.exec(head)) !== null) {
    const tok = m[0]?.trim();
    if (tok) found.add(tok.toUpperCase() === "AZ RN" ? "AZ RN" : tok.toUpperCase());
  }
  if (!found.size) return undefined;
  return sf([...found].slice(0, 12).join(", "), "medium", "Credential keywords");
}

export function extractYearsExperience(text: string): SuggestedResumeField | undefined {
  const m = text.match(/\b(\d{1,2})\+?\s*(?:years?|yrs\.?)\s+(?:of\s+)?(?:experience|exp\.?|in\s+nursing)\b/i);
  if (m?.[1]) return sf(`${m[1]}+ years`, "medium", "Experience statement") ?? undefined;
  const m2 = text.match(/\b(\d{1,2})\+?\s*yrs\b/i);
  if (m2?.[1]) return sf(`${m2[1]}+ years`, "low", "Years abbreviation") ?? undefined;
  return undefined;
}

export function extractLabeledSpecialties(text: string): SuggestedResumeField | undefined {
  const m = text.match(/(?:^|\n)\s*specialties?:\s*(.+)/i);
  const line = m?.[1]?.trim().split(/\n/)[0]?.trim();
  if (!line || line.length < 2) return undefined;
  return sf(line.slice(0, 400), "medium", "Specialties label");
}
