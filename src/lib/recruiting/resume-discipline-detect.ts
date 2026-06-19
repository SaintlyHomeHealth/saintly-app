import "server-only";

import type { RecruitingDisciplineOption } from "@/lib/recruiting/recruiting-options";
import type { ResumeParseConfidence } from "@/lib/recruiting/resume-parse-types";

export type DisciplineDetectionResult = {
  value: RecruitingDisciplineOption;
  score: number;
  confidence: ResumeParseConfidence;
  evidence: string[];
  parseNote: string;
} | null;

type DisciplineRule = {
  pattern: RegExp;
  value: RecruitingDisciplineOption;
  weight: number;
  evidence: string;
};

/**
 * Higher weight = stronger signal. PTA/phrase rules before PT/abbrev.
 * ST uses uppercase-only `\bST\b` to avoid street suffixes like "Main St".
 */
const DISCIPLINE_RULES: DisciplineRule[] = [
  { pattern: /\bregistered nurse\b/i, value: "RN", weight: 12, evidence: "Registered Nurse" },
  { pattern: /\bBSN\b/i, value: "RN", weight: 9, evidence: "BSN" },
  { pattern: /\bRN\b/i, value: "RN", weight: 8, evidence: "RN" },
  { pattern: /\blicensed practical nurse\b/i, value: "LPN", weight: 12, evidence: "Licensed Practical Nurse" },
  { pattern: /\bLVN\b/i, value: "LPN", weight: 9, evidence: "LVN" },
  { pattern: /\bLPN\b/i, value: "LPN", weight: 8, evidence: "LPN" },
  { pattern: /\bcertified nursing assistant\b/i, value: "CNA", weight: 12, evidence: "Certified Nursing Assistant" },
  { pattern: /\bCNA\b/i, value: "CNA", weight: 8, evidence: "CNA" },
  { pattern: /\bphysical therapist assistant\b/i, value: "PTA", weight: 14, evidence: "Physical Therapist Assistant" },
  { pattern: /\bphysical therapy assistant\b/i, value: "PTA", weight: 14, evidence: "Physical Therapy Assistant" },
  { pattern: /\bPTA\b/i, value: "PTA", weight: 12, evidence: "PTA" },
  { pattern: /\bphysical therapist\b(?!\s+assistant)/i, value: "PT", weight: 14, evidence: "Physical Therapist" },
  { pattern: /\bDPT\b/i, value: "PT", weight: 10, evidence: "DPT" },
  { pattern: /\bPT\b/i, value: "PT", weight: 5, evidence: "PT" },
  { pattern: /\boccupational therapist registered\b/i, value: "OT", weight: 14, evidence: "Occupational Therapist Registered" },
  { pattern: /\boccupational therapist\b(?!\s+assistant)/i, value: "OT", weight: 14, evidence: "Occupational Therapist" },
  { pattern: /\boccupational therapy\b(?!\s+assistant)/i, value: "OT", weight: 12, evidence: "Occupational Therapy" },
  { pattern: /\bOTR\/L\b/i, value: "OT", weight: 13, evidence: "OTR/L" },
  { pattern: /\bO\.T\.R\.?\/?L?\.?\b/i, value: "OT", weight: 13, evidence: "O.T.R." },
  { pattern: /\bOTR\b/i, value: "OT", weight: 12, evidence: "OTR" },
  { pattern: /\bOTD\b/i, value: "OT", weight: 10, evidence: "OTD" },
  { pattern: /\bMOT\b/i, value: "OT", weight: 10, evidence: "MOT" },
  { pattern: /\bMSOT\b/i, value: "OT", weight: 10, evidence: "MSOT" },
  { pattern: /\bBSOT\b/i, value: "OT", weight: 10, evidence: "BSOT" },
  { pattern: /\bOT\b/i, value: "OT", weight: 8, evidence: "OT" },
  { pattern: /\bspeech[- ]language pathologist\b/i, value: "ST", weight: 14, evidence: "Speech-Language Pathologist" },
  { pattern: /\bspeech therapist\b/i, value: "ST", weight: 12, evidence: "Speech Therapist" },
  { pattern: /\bspeech therapy\b/i, value: "ST", weight: 12, evidence: "Speech Therapy" },
  { pattern: /\bCCC[- ]SLP\b/i, value: "ST", weight: 13, evidence: "CCC-SLP" },
  { pattern: /\bSLP\b/i, value: "ST", weight: 11, evidence: "SLP" },
  { pattern: /\bST\b/, value: "ST", weight: 8, evidence: "ST" },
  { pattern: /\bhome health social worker\b/i, value: "MSW", weight: 15, evidence: "Home Health Social Worker" },
  { pattern: /\bmedical social worker\b/i, value: "MSW", weight: 14, evidence: "Medical Social Worker" },
  { pattern: /\bmedical social work\b/i, value: "MSW", weight: 13, evidence: "Medical Social Work" },
  { pattern: /\blicensed master social worker\b/i, value: "MSW", weight: 14, evidence: "Licensed Master Social Worker" },
  { pattern: /\bmaster of social work\b/i, value: "MSW", weight: 13, evidence: "Master of Social Work" },
  { pattern: /\blicensed clinical social worker\b/i, value: "MSW", weight: 14, evidence: "Licensed Clinical Social Worker" },
  { pattern: /\bLCSW\b/i, value: "MSW", weight: 13, evidence: "LCSW" },
  { pattern: /\bLMSW\b/i, value: "MSW", weight: 13, evidence: "LMSW" },
  { pattern: /\bMSW\b/i, value: "MSW", weight: 11, evidence: "MSW" },
  { pattern: /\bsocial worker\b/i, value: "MSW", weight: 10, evidence: "Social Worker" },
  { pattern: /\bhome health aide\b/i, value: "HHA", weight: 12, evidence: "Home Health Aide" },
  { pattern: /\bHHA\b/i, value: "HHA", weight: 8, evidence: "HHA" },
];

const MIN_SCORE = 8;
const HIGH_SCORE = 12;

function testRule(pattern: RegExp, text: string, upper: string): boolean {
  pattern.lastIndex = 0;
  if (pattern.test(text)) return true;
  if (pattern.flags.includes("i")) {
    pattern.lastIndex = 0;
    return pattern.test(upper);
  }
  return false;
}

export function detectResumeDiscipline(text: string, flatText: string): DisciplineDetectionResult {
  const upper = flatText.toUpperCase();
  const scores = new Map<RecruitingDisciplineOption, { score: number; evidence: string[] }>();

  for (const rule of DISCIPLINE_RULES) {
    if (!testRule(rule.pattern, flatText, upper) && !testRule(rule.pattern, text, upper)) continue;
    const prev = scores.get(rule.value) ?? { score: 0, evidence: [] };
    prev.score += rule.weight;
    if (!prev.evidence.includes(rule.evidence)) prev.evidence.push(rule.evidence);
    scores.set(rule.value, prev);
  }

  if (scores.size === 0) return null;

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const [value, top] = ranked[0]!;
  const runnerUp = ranked[1];

  if (top.score < MIN_SCORE) return null;

  if (runnerUp && runnerUp[1].score >= top.score - 3 && runnerUp[0] !== value) {
    return null;
  }

  let confidence: ResumeParseConfidence = "medium";
  if (top.score >= HIGH_SCORE) confidence = "high";
  else if (top.score < MIN_SCORE) confidence = "low";

  if (value === "PT" && top.score < HIGH_SCORE && !top.evidence.includes("Physical Therapist") && !top.evidence.includes("DPT")) {
    confidence = "low";
    if (top.score < MIN_SCORE + 1) return null;
  }

  const parseNote = `Detected ${value} because resume contained ${top.evidence.join(", ")}.`;

  return {
    value,
    score: top.score,
    confidence,
    evidence: top.evidence,
    parseNote,
  };
}
