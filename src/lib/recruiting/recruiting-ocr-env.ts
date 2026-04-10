import "server-only";

import { createRequire } from "node:module";
import path from "node:path";

/**
 * Resume OCR uses bundled @tesseract.js-data/eng (no CDN / runtime language downloads).
 * Set RECRUITING_RESUME_OCR_ENABLED=false to skip OCR and rely on manual entry.
 */

export function isRecruitingResumeOcrEnabled(): boolean {
  const v = process.env.RECRUITING_RESUME_OCR_ENABLED?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return true;
}

/** Directory containing eng.traineddata.gz for LSTM (4.0.0_best_int). */
export function getBundledTesseractEngLangDir(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const pkg = path.dirname(require.resolve("@tesseract.js-data/eng/package.json"));
    return path.join(pkg, "4.0.0_best_int");
  } catch {
    return null;
  }
}

export function canRunResumePdfOcr(): boolean {
  return isRecruitingResumeOcrEnabled() && getBundledTesseractEngLangDir() !== null;
}
