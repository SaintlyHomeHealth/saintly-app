import "server-only";

import type { ParsedResumeSuggestions } from "@/lib/recruiting/resume-parse-types";

const SECTION_HINTS = [
  "experience",
  "education",
  "skills",
  "license",
  "certification",
  "employment",
  "summary",
];

export type ResumeExtractQualityAssessment = {
  needsReview: boolean;
  warnings: string[];
  weirdCharRatio: number;
  missingSections: string[];
};

function weirdCharRatio(text: string): number {
  if (!text.length) return 1;
  const weird = (text.match(/[^\w\s@.,;:'"()\-+/#&%]/g) ?? []).length;
  return weird / text.length;
}

function hasSectionHints(text: string): string[] {
  const lower = text.toLowerCase();
  return SECTION_HINTS.filter((s) => lower.includes(s));
}

export function assessResumeExtractQuality(
  cleanedText: string,
  suggestions: ParsedResumeSuggestions | null
): ResumeExtractQualityAssessment {
  const warnings: string[] = [];
  const len = cleanedText.trim().length;
  const weird = weirdCharRatio(cleanedText);
  const sections = hasSectionHints(cleanedText);
  const missingSections = SECTION_HINTS.filter((s) => !sections.includes(s));

  if (len < 120) {
    warnings.push("Extracted text is very short.");
  } else if (len < 280) {
    warnings.push("Extracted text may be incomplete.");
  }

  if (weird > 0.14) {
    warnings.push("Text contains many unusual characters (possible OCR noise).");
  }

  const name =
    suggestions?.full_name?.value?.trim() ||
    (suggestions?.first_name?.value?.trim() && suggestions?.last_name?.value?.trim()
      ? `${suggestions.first_name.value} ${suggestions.last_name.value}`
      : "");
  const email = suggestions?.email?.value?.trim();
  const phone = suggestions?.phone?.value?.trim();
  const discipline = suggestions?.discipline?.value?.trim();

  if (!name) warnings.push("No name detected.");
  if (!email && !phone) warnings.push("No phone or email detected.");
  if (!discipline) warnings.push("No role/license detected.");

  if (missingSections.length >= 4) {
    warnings.push("Common resume sections (Experience, Education, Skills) were not found.");
  }

  const disciplineLow = suggestions?.discipline?.confidence === "low" || suggestions?.discipline?.label === "review";
  if (disciplineLow) {
    warnings.push("Role/license match is low confidence — please verify.");
  }

  const critical = !name || (!email && !phone) || !discipline || len < 120;
  const needsReview = warnings.length >= 2 || critical || disciplineLow;

  if (needsReview && !warnings.includes("Resume text may need review.")) {
    warnings.unshift("Resume text may need review.");
  }

  return {
    needsReview,
    warnings,
    weirdCharRatio: weird,
    missingSections,
  };
}
