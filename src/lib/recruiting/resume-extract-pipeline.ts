import "server-only";

import { canRunResumePdfOcr } from "@/lib/recruiting/recruiting-ocr-env";
import { parseResumePlainText } from "@/lib/recruiting/resume-parse-heuristics";
import type { ParsedResumeSuggestions, ResumeParseQuality } from "@/lib/recruiting/resume-parse-types";
import { ocrPdfBuffer } from "@/lib/recruiting/resume-pdf-ocr";
import { extractResumeText } from "@/lib/recruiting/resume-text-extract";

/** Minimum character count to treat extraction as usable for heuristics. */
export const MIN_USABLE_TEXT_LEN = 20;

/**
 * If direct PDF text is at least this long, assume a normal text PDF and skip OCR (performance).
 */
const OCR_SKIP_IF_DIRECT_CHARS = 200;

/**
 * If direct PDF text is this short or empty, consider running OCR (image-based PDFs).
 */
const OCR_SHORT_DIRECT_CHARS = 45;

export type ResumeExtractionSource = "direct" | "ocr" | "none";

export type ResumeExtractPipelineResult = {
  text: string;
  extractionSource: ResumeExtractionSource;
  quality: ResumeParseQuality;
  suggestions: ParsedResumeSuggestions | null;
  directError?: string;
  ocrError?: string;
  /** Short UI lines for banners */
  messages: string[];
};

function isPdfFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(".pdf");
}

function hasStrongSuggestions(s: ParsedResumeSuggestions): boolean {
  const name =
    s.full_name?.value?.trim() ||
    (s.first_name?.value?.trim() && s.last_name?.value?.trim() ? `${s.first_name.value} ${s.last_name.value}` : "");
  const email = s.email?.value?.trim();
  const phone = s.phone?.value?.trim();
  if (name && (email || phone)) return true;
  if (email && phone) return true;
  return false;
}

function hasAnySuggestion(s: ParsedResumeSuggestions): boolean {
  return Object.keys(s).length > 0;
}

/**
 * PDF only. Conservative: skip OCR for clearly text-based PDFs; only run when direct text looks unusable.
 */
function shouldAttemptPdfOcr(directText: string, filename: string): boolean {
  if (!isPdfFilename(filename)) return false;
  if (!canRunResumePdfOcr()) return false;
  if (directText.length >= OCR_SKIP_IF_DIRECT_CHARS) return false;

  if (directText.length <= OCR_SHORT_DIRECT_CHARS) {
    return true;
  }

  let suggestions: ParsedResumeSuggestions | null = null;
  try {
    suggestions = parseResumePlainText(directText);
  } catch {
    suggestions = null;
  }

  if (!suggestions || !hasAnySuggestion(suggestions)) {
    return true;
  }

  if (hasStrongSuggestions(suggestions)) {
    return false;
  }

  return true;
}

function buildQuality(
  extractionSource: ResumeExtractionSource,
  textLen: number,
  suggestions: ParsedResumeSuggestions | null
): ResumeParseQuality {
  if (textLen < MIN_USABLE_TEXT_LEN) {
    return "manual";
  }
  if (!suggestions || !hasAnySuggestion(suggestions)) {
    if (extractionSource === "ocr") return "ocr_limited";
    return "manual";
  }
  const strong = hasStrongSuggestions(suggestions);
  if (extractionSource === "ocr") {
    return strong ? "ocr_success" : "ocr_limited";
  }
  return strong ? "parsed_ok" : "limited_parse";
}

type MessageCtx = {
  ocrApplicable: boolean;
  /** Bundled data present and env flag allows OCR */
  ocrRunnable: boolean;
  ocrAttempted: boolean;
};

function buildMessages(quality: ResumeParseQuality, ctx?: MessageCtx): string[] {
  switch (quality) {
    case "parsed_ok":
      return ["Parsed successfully."];
    case "limited_parse":
      return ["Limited parse — review and edit fields before saving."];
    case "ocr_success":
      return ["Image-based resume — OCR was used to read text.", "Review suggestions before saving."];
    case "ocr_limited":
      return [
        "Image-based resume — OCR was used, but auto-fill is partial.",
        "Resume uploaded, but we could not auto-read enough text for full suggestions — edit fields as needed.",
      ];
    case "manual": {
      const line1 = "Resume uploaded, but we could not auto-read enough text from this file.";
      if (!ctx?.ocrApplicable) {
        return [line1, "You can still create the candidate manually."];
      }
      if (!ctx.ocrRunnable) {
        return [line1, "You can still create the candidate manually."];
      }
      if (ctx.ocrAttempted) {
        return [line1, "You can still create the candidate manually."];
      }
      return [line1, "You can still create the candidate manually or try OCR fallback if enabled."];
    }
    default: {
      const _exhaustive: never = quality;
      return [_exhaustive];
    }
  }
}

function pickBestText(direct: string, ocr: string): { text: string; source: ResumeExtractionSource } {
  const d = direct.trim();
  const o = ocr.trim();
  if (o.length >= MIN_USABLE_TEXT_LEN && o.length > d.length) {
    return { text: o.slice(0, 120_000), source: "ocr" };
  }
  if (d.length >= MIN_USABLE_TEXT_LEN) {
    return { text: d.slice(0, 120_000), source: "direct" };
  }
  if (o.length > d.length) {
    return { text: o.slice(0, 120_000), source: "ocr" };
  }
  return { text: d || o, source: d.length > 0 ? "direct" : o.length > 0 ? "ocr" : "none" };
}

/**
 * Extract text (PDF/DOC/DOCX), optionally OCR PDFs when direct text is empty/short or heuristics are weak.
 */
export async function runResumeExtractPipeline(buffer: Buffer, filename: string): Promise<ResumeExtractPipelineResult> {
  const direct = await extractResumeText(buffer, filename);
  const directText = (direct.text ?? "").trim();

  const ocrApplicable = isPdfFilename(filename);
  const ocrRunnable = canRunResumePdfOcr();
  let ocrAttempted = false;
  let ocrError: string | undefined;

  let text = directText;
  let extractionSource: ResumeExtractionSource = "direct";

  if (shouldAttemptPdfOcr(directText, filename)) {
    ocrAttempted = true;
    const ocr = await ocrPdfBuffer(buffer);
    if (ocr.error) {
      ocrError = ocr.error;
    }
    const picked = pickBestText(directText, ocr.text ?? "");
    text = picked.text;
    extractionSource = picked.source;
  }

  const msgCtx: MessageCtx = {
    ocrApplicable,
    ocrRunnable,
    ocrAttempted,
  };

  if (text.length < MIN_USABLE_TEXT_LEN) {
    const quality: ResumeParseQuality = "manual";
    return {
      text,
      extractionSource: text.length > 0 && extractionSource === "ocr" ? "ocr" : "none",
      quality,
      suggestions: null,
      directError: direct.error,
      ocrError,
      messages: buildMessages(quality, msgCtx),
    };
  }

  let suggestions: ParsedResumeSuggestions | null = null;
  try {
    suggestions = parseResumePlainText(text);
  } catch {
    suggestions = null;
  }

  const quality = buildQuality(extractionSource, text.length, suggestions);
  return {
    text,
    extractionSource: extractionSource === "ocr" ? "ocr" : "direct",
    quality,
    suggestions,
    directError: direct.error,
    ocrError,
    messages: buildMessages(quality, msgCtx),
  };
}

/** Activity body for recruiting_candidate_activities.resume_parsed */
export function resumeParsedActivityBody(quality: ResumeParseQuality): string {
  switch (quality) {
    case "ocr_success":
    case "ocr_limited":
      return "Resume parsed using OCR fallback";
    case "manual":
      return "Resume stored, but auto-fill could not read enough text. Candidate created manually.";
    case "parsed_ok":
    case "limited_parse":
      return "Resume parsed and suggestions generated";
    default: {
      const _e: never = quality;
      return _e;
    }
  }
}
