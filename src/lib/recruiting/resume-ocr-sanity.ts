import "server-only";

/**
 * Internal sanity checks for OCR page-1 text (debug / QA).
 * Not used in production UX — helps confirm OCR read a known resume fixture.
 */
export type ResumeOcrSanityResult = {
  /** Substrings or patterns we expected to find */
  matched: string[];
  missing: string[];
};

const DEFAULT_EXPECTATIONS: { id: string; test: (t: string) => boolean }[] = [
  { id: "name Ranya Szmutko", test: (t) => /ranya\s+szmutko/i.test(t) },
  { id: "Registered Nurse phrase", test: (t) => /registered\s+nurse/i.test(t) },
  { id: "RN token", test: (t) => /\bRN\b/i.test(t) },
  { id: "BSN token", test: (t) => /\bBSN\b/i.test(t) },
  { id: "phone pattern", test: (t) => /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t) },
  { id: "email pattern", test: (t) => /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(t) },
];

export function evaluateResumeOcrSanity(page1OcrText: string, expectations = DEFAULT_EXPECTATIONS): ResumeOcrSanityResult {
  const matched: string[] = [];
  const missing: string[] = [];
  const text = page1OcrText ?? "";
  for (const { id, test } of expectations) {
    if (test(text)) matched.push(id);
    else missing.push(id);
  }
  return { matched, missing };
}
