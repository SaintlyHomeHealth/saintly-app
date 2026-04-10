import "server-only";

import { RESUME_SOFT_MANUAL_PARSE_CREATE } from "@/lib/recruiting/resume-upload-mime";
import { isForceOcrPage1DebugMode, isResumeExtractDebugEnabled } from "@/lib/recruiting/resume-extract-debug";
import { canRunResumePdfOcr } from "@/lib/recruiting/recruiting-ocr-env";
import { parseResumePlainText } from "@/lib/recruiting/resume-parse-heuristics";
import type { ParsedResumeSuggestions, ResumeParseQuality } from "@/lib/recruiting/resume-parse-types";
import type { PdfOcrDebug, PdfOcrResult } from "@/lib/recruiting/resume-pdf-ocr";
import { ocrPdfBuffer } from "@/lib/recruiting/resume-pdf-ocr";
import { extractResumeText } from "@/lib/recruiting/resume-text-extract";

/** Minimum character count to treat extraction as usable for heuristics. */
export const MIN_USABLE_TEXT_LEN = 20;

/**
 * If direct PDF text is at least this long *and* heuristics find strong contact fields,
 * skip OCR (performance).
 */
const OCR_SKIP_IF_DIRECT_CHARS = 200;

/**
 * If direct PDF text is this short or empty, consider running OCR (image-based PDFs).
 */
const OCR_SHORT_DIRECT_CHARS = 45;

export type ResumeExtractionSource = "direct" | "ocr" | "none";

export type ResumeExtractFailureStep =
  | "none"
  | "direct_extraction_empty"
  | "ocr_disabled_or_unavailable"
  | "pdf_render_failed"
  | "ocr_init_failed"
  | "ocr_empty_text"
  | "parse_heuristics_no_fields"
  | "parse_heuristics_weak";

export type ResumeExtractDebugSummary = {
  filename: string;
  mimeType?: string;
  directTextLen: number;
  directError?: string;
  ocrRunnable: boolean;
  ocrAttempted: boolean;
  ocrError?: string;
  pdfOcrDebug?: PdfOcrDebug;
  /** Combined OCR text length (trimmed) */
  ocrRawTextLen: number;
  /** Page-1-only OCR when force-debug is on */
  forceOcrPage1Debug?: boolean;
  /** Raw OCR text from page 1 (force-debug) or first page slice */
  ocrPage1RawText?: string;
  finalTextLen: number;
  extractionSource: ResumeExtractionSource;
  parseHeuristicsInputLen: number;
  parseHeuristicsReceivedOcrText: boolean;
  /** Keys of non-undefined suggested fields */
  suggestionFieldKeys: string[];
  /** Flattened values for logs */
  suggestedFieldPreview: Record<string, string>;
  failureStep: ResumeExtractFailureStep;
  /** First 500 chars passed to parseResumePlainText */
  parseInputFirst500?: string;
  /** First 500 chars of direct PDF/DOC extract (before OCR merge) */
  directTextPreview?: string;
  /** First 500 chars of raw OCR output (combined pages) */
  ocrTextPreview?: string;
  /** Same slice as parseInputFirst500 — explicit name for API hard-debug */
  finalParsePreview?: string;
};

export type ResumeExtractPipelineResult = {
  text: string;
  extractionSource: ResumeExtractionSource;
  quality: ResumeParseQuality;
  suggestions: ParsedResumeSuggestions | null;
  directError?: string;
  ocrError?: string;
  /** Short UI lines for banners */
  messages: string[];
  /** Present when `includeDebug` was requested and debug logging is enabled */
  debug?: ResumeExtractDebugSummary;
  /** When force page-1 OCR debug ran: raw text from Tesseract (page 1 only) */
  ocrPage1RawText?: string;
  forceOcrPage1Debug?: boolean;
};

export type ResumeExtractPipelineOptions = {
  mimeType?: string;
  includeDebug?: boolean;
  /**
   * Run OCR on PDF page 1 only and include raw text in debug (also when env
   * `RECRUITING_RESUME_FORCE_OCR_PAGE1_DEBUG=1` in development).
   */
  forceOcrPage1Debug?: boolean;
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

function suggestionKeys(s: ParsedResumeSuggestions | null): string[] {
  if (!s) return [];
  return Object.keys(s).filter((k) => s[k as keyof ParsedResumeSuggestions] != null);
}

function suggestionPreview(s: ParsedResumeSuggestions | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const key of Object.keys(s) as (keyof ParsedResumeSuggestions)[]) {
    const f = s[key];
    if (f?.value) out[key] = String(f.value).slice(0, 200);
  }
  return out;
}

/**
 * PDF only. Run OCR when direct text is short, or when long text still does not yield strong parse signals.
 * **Important:** Do not skip OCR solely because direct text length ≥ 200 — scanned PDFs often embed junk text.
 */
function shouldAttemptPdfOcr(directText: string, filename: string): boolean {
  if (!isPdfFilename(filename)) return false;
  if (!canRunResumePdfOcr()) return false;

  if (directText.length <= OCR_SHORT_DIRECT_CHARS) {
    return true;
  }

  let suggestions: ParsedResumeSuggestions | null = null;
  try {
    suggestions = parseResumePlainText(directText);
  } catch {
    suggestions = null;
  }

  if (directText.length >= OCR_SKIP_IF_DIRECT_CHARS && suggestions && hasStrongSuggestions(suggestions)) {
    return false;
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
      if (!ctx?.ocrApplicable || !ctx?.ocrRunnable || ctx.ocrAttempted) {
        return [RESUME_SOFT_MANUAL_PARSE_CREATE];
      }
      return [
        RESUME_SOFT_MANUAL_PARSE_CREATE,
        "OCR fallback may be disabled in this environment — fill in the form below.",
      ];
    }
    default: {
      const _exhaustive: never = quality;
      return [_exhaustive];
    }
  }
}

function pickBestText(
  direct: string,
  ocr: string,
  ocrAttempted: boolean
): { text: string; source: ResumeExtractionSource } {
  const d = direct.trim();
  const o = ocr.trim();

  // After an OCR attempt, long "direct" text is often PDF metadata or junk; prefer OCR when it produced text.
  if (ocrAttempted && o.length >= MIN_USABLE_TEXT_LEN) {
    let directStrong = false;
    try {
      const parsed = parseResumePlainText(d);
      directStrong = parsed ? hasStrongSuggestions(parsed) : false;
    } catch {
      directStrong = false;
    }
    if (!directStrong) {
      return { text: o.slice(0, 120_000), source: "ocr" };
    }
    if (o.length >= d.length) {
      return { text: o.slice(0, 120_000), source: "ocr" };
    }
    return { text: d.slice(0, 120_000), source: "direct" };
  }

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
 * Prefer OCR-first when OCR ran and produced usable text so noisy direct metadata does not hide the visible resume.
 */
function buildTextForHeuristics(
  directText: string,
  ocrText: string | undefined,
  ocrAttempted: boolean,
  picked: { text: string; source: ResumeExtractionSource }
): { parseInput: string; parseReceivedOcr: boolean } {
  const o = (ocrText ?? "").trim();
  const d = directText.trim();
  if (ocrAttempted && o.length >= MIN_USABLE_TEXT_LEN) {
    return { parseInput: `${o}\n\n${d}`.slice(0, 120_000), parseReceivedOcr: true };
  }
  return { parseInput: picked.text, parseReceivedOcr: false };
}

function shouldLogPipeline(): boolean {
  return isResumeExtractDebugEnabled();
}

function inferFailureStep(args: {
  directLen: number;
  ocrRunnable: boolean;
  ocrAttempted: boolean;
  ocr: PdfOcrResult;
  pickedTextLen: number;
  parseInputLen: number;
  suggestions: ParsedResumeSuggestions | null;
}): ResumeExtractFailureStep {
  const { directLen, ocrRunnable, ocrAttempted, ocr, pickedTextLen, parseInputLen, suggestions } = args;
  const ocrLen = (ocr.text ?? "").trim().length;
  const dbg = ocr.debug;

  /** Junk direct text (e.g. page markers) can exceed min length while every page render fails — still OCR-blocked */
  if (ocrAttempted && ocrLen === 0 && dbg?.pages?.length) {
    const allRenderFailed = dbg.pages.every((p) => p.renderLikelyFailed);
    if (allRenderFailed) return "pdf_render_failed";
  }

  if (pickedTextLen < MIN_USABLE_TEXT_LEN) {
    if (directLen === 0 && !ocrAttempted) {
      return ocrRunnable ? "direct_extraction_empty" : "ocr_disabled_or_unavailable";
    }
    if (!ocrRunnable && ocrAttempted === false) return "ocr_disabled_or_unavailable";
    if (ocrAttempted && dbg && !dbg.workerInitOk) return "ocr_init_failed";
    if (ocrAttempted && dbg?.pages?.length) {
      const allBad = dbg.pages.every((p) => p.renderLikelyFailed);
      if (allBad) return "pdf_render_failed";
    }
    if (ocrAttempted && ocrLen === 0) {
      if (ocr.error?.toLowerCase().includes("worker") || ocr.error?.toLowerCase().includes("tesseract")) {
        return "ocr_init_failed";
      }
      return "ocr_empty_text";
    }
    return "direct_extraction_empty";
  }

  if (parseInputLen >= MIN_USABLE_TEXT_LEN && (!suggestions || !hasAnySuggestion(suggestions))) {
    return "parse_heuristics_no_fields";
  }
  if (parseInputLen >= MIN_USABLE_TEXT_LEN && suggestions && !hasStrongSuggestions(suggestions)) {
    return "parse_heuristics_weak";
  }
  return "none";
}

/**
 * Extract text (PDF/DOC/DOCX), optionally OCR PDFs when direct text is empty/short or heuristics are weak.
 * Never throws — failures become `quality: manual` for API routes.
 */
export async function runResumeExtractPipeline(
  buffer: Buffer,
  filename: string,
  options?: ResumeExtractPipelineOptions
): Promise<ResumeExtractPipelineResult> {
  try {
    return await runResumeExtractPipelineInternal(buffer, filename, options);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    if (shouldLogPipeline()) {
      console.error("[resume pipeline] fatal (recovering to manual)", { filename, msg, stack });
    }
    const ocrApplicable = isPdfFilename(filename);
    const ocrRunnable = canRunResumePdfOcr();
    return {
      text: "",
      extractionSource: "none",
      quality: "manual",
      suggestions: null,
      directError: msg,
      ocrError: msg,
      messages: buildMessages("manual", {
        ocrApplicable,
        ocrRunnable,
        ocrAttempted: false,
      }),
    };
  }
}

async function runResumeExtractPipelineInternal(
  buffer: Buffer,
  filename: string,
  options?: ResumeExtractPipelineOptions
): Promise<ResumeExtractPipelineResult> {
  const mimeType = options?.mimeType;
  const forcePage1 =
    Boolean(options?.forceOcrPage1Debug) || (isForceOcrPage1DebugMode() && isPdfFilename(filename));
  const includeDebug =
    (Boolean(options?.includeDebug) || Boolean(options?.forceOcrPage1Debug)) && shouldLogPipeline();

  const direct = await extractResumeText(buffer, filename);
  const directText = (direct.text ?? "").trim();

  const ocrApplicable = isPdfFilename(filename);
  const ocrRunnable = canRunResumePdfOcr();
  let ocrAttempted = false;
  let ocrError: string | undefined;
  let ocrRawLen = 0;
  let ocrResult: PdfOcrResult = { text: "" };

  let text = directText;
  let extractionSource: ResumeExtractionSource = "direct";

  if (forcePage1 && ocrApplicable && ocrRunnable) {
    ocrAttempted = true;
    ocrResult = await ocrPdfBuffer(buffer, {
      filename,
      mimeType,
      maxPages: 1,
      forceDebug: true,
    });
    ocrRawLen = (ocrResult.text ?? "").trim().length;
    if (ocrResult.error) {
      ocrError = ocrResult.error;
    }
    const picked = pickBestText(directText, ocrResult.text ?? "", ocrAttempted);
    text = picked.text;
    extractionSource = picked.source;
  } else if (shouldAttemptPdfOcr(directText, filename)) {
    ocrAttempted = true;
    ocrResult = await ocrPdfBuffer(buffer, {
      filename,
      mimeType,
      forceDebug: includeDebug || shouldLogPipeline(),
    });
    ocrRawLen = (ocrResult.text ?? "").trim().length;
    if (ocrResult.error) {
      ocrError = ocrResult.error;
    }
    const picked = pickBestText(directText, ocrResult.text ?? "", ocrAttempted);
    text = picked.text;
    extractionSource = picked.source;
  }

  const { parseInput, parseReceivedOcr } = buildTextForHeuristics(
    directText,
    ocrResult.text,
    ocrAttempted,
    { text, source: extractionSource }
  );

  /** Prefer merged OCR-first text for API + quality when it carries more than `text` alone */
  const textOut = parseInput.trim().length > text.trim().length ? parseInput : text;
  const extractionSourceOut: ResumeExtractionSource =
    parseReceivedOcr && textOut === parseInput ? "ocr" : extractionSource;

  const msgCtx: MessageCtx = {
    ocrApplicable,
    ocrRunnable,
    ocrAttempted,
  };

  if (shouldLogPipeline()) {
    const ocrPages = ocrResult.debug?.pages ?? [];
    const first300 =
      process.env.NODE_ENV === "development" || process.env.RECRUITING_RESUME_PARSE_DEBUG === "1"
        ? ocrPages.map((p) => ({
            page: p.pageIndex,
            len: p.ocrRawTextLen,
            first300: p.ocrPreview300 ?? "",
          }))
        : ocrPages.map((p) => ({ page: p.pageIndex, len: p.ocrRawTextLen }));

    console.log("[resume pipeline] extract", {
      filename,
      mimeType: mimeType ?? null,
      directTextLen: directText.length,
      directFirst500: directText.slice(0, 500),
      directError: direct.error ?? null,
      ocrAttempted,
      ocrRunnable,
      ocrRawTextLen: ocrAttempted ? ocrRawLen : 0,
      ocrError: ocrError ?? null,
      pdfNumPages: ocrResult.debug?.pdfNumPages ?? null,
      pagesRenderedForOcr: ocrResult.debug?.pagesRendered ?? null,
      pageDimensions: ocrPages.map((p) => ({
        page: p.pageIndex,
        w: p.canvasWidth,
        h: p.canvasHeight,
        nonWhiteRatio: Number(p.nonWhiteSampleRatio.toFixed(4)),
        renderLikelyFailed: p.renderLikelyFailed,
      })),
      ocrPageSummaries: first300,
      combinedOcrTextLen: ocrAttempted ? ocrRawLen : 0,
      finalPickedTextLen: text.length,
      textOutLen: textOut.length,
      extractionSource,
      extractionSourceOut,
      parseHeuristicsReceivedOcrText: parseReceivedOcr,
      parseHeuristicsInputLen: parseInput.length,
      parseInputFirst500: parseInput.slice(0, 500),
      ocrFirst500: (ocrResult.text ?? "").slice(0, 500),
      forceOcrPage1: forcePage1,
    });
  }

  let suggestions: ParsedResumeSuggestions | null = null;
  try {
    suggestions = parseResumePlainText(parseInput);
  } catch (pe) {
    if (shouldLogPipeline()) {
      console.error("[resume pipeline] parseResumePlainText threw", pe);
    }
    suggestions = null;
  }

  if (shouldLogPipeline()) {
    const keys = suggestionKeys(suggestions);
    console.log("[resume pipeline] parse", {
      suggestionFieldKeys: keys,
      suggestedFieldPreview: suggestionPreview(suggestions),
      parseHeuristicsReceivedOcrText: parseReceivedOcr,
    });
  }

  const failureStep = inferFailureStep({
    directLen: directText.length,
    ocrRunnable,
    ocrAttempted,
    ocr: ocrResult,
    pickedTextLen: textOut.length,
    parseInputLen: parseInput.length,
    suggestions,
  });

  if (shouldLogPipeline()) {
    console.log("[resume pipeline] failureStep", { failureStep });
  }

  if (textOut.length < MIN_USABLE_TEXT_LEN) {
    const quality: ResumeParseQuality = "manual";
    const result: ResumeExtractPipelineResult = {
      text: textOut,
      extractionSource: textOut.length > 0 && extractionSourceOut === "ocr" ? "ocr" : "none",
      quality,
      suggestions: null,
      directError: direct.error,
      ocrError,
      messages: buildMessages(quality, msgCtx),
      ...(forcePage1 && ocrApplicable && (includeDebug || options?.forceOcrPage1Debug)
        ? {
            forceOcrPage1Debug: true,
            ocrPage1RawText: ocrResult.text ?? "",
          }
        : {}),
    };
    if (includeDebug) {
      result.debug = {
        filename,
        mimeType,
        directTextLen: directText.length,
        directError: direct.error,
        ocrRunnable,
        ocrAttempted,
        ocrError,
        pdfOcrDebug: ocrResult.debug,
        ocrRawTextLen: ocrRawLen,
        forceOcrPage1Debug: forcePage1,
        ocrPage1RawText: forcePage1 ? (ocrResult.text ?? "") : undefined,
        finalTextLen: textOut.length,
        extractionSource: extractionSourceOut,
        parseHeuristicsInputLen: parseInput.length,
        parseHeuristicsReceivedOcrText: parseReceivedOcr,
        suggestionFieldKeys: [],
        suggestedFieldPreview: {},
        failureStep,
        parseInputFirst500: parseInput.slice(0, 500),
        directTextPreview: directText.slice(0, 500),
        ocrTextPreview: (ocrResult.text ?? "").slice(0, 500),
        finalParsePreview: parseInput.slice(0, 500),
      };
    }
    if (shouldLogPipeline()) {
      console.log("[resume pipeline] quality", { quality: result.quality });
    }
    return result;
  }

  const quality = buildQuality(extractionSourceOut, textOut.length, suggestions);
  const result: ResumeExtractPipelineResult = {
    text: textOut,
    extractionSource: extractionSourceOut === "ocr" ? "ocr" : "direct",
    quality,
    suggestions,
    directError: direct.error,
    ocrError,
    messages: buildMessages(quality, msgCtx),
    ...(forcePage1 && ocrApplicable && (includeDebug || options?.forceOcrPage1Debug)
      ? {
          forceOcrPage1Debug: true,
          ocrPage1RawText: ocrResult.text ?? "",
        }
      : {}),
  };
  if (includeDebug) {
    result.debug = {
      filename,
      mimeType,
      directTextLen: directText.length,
      directError: direct.error,
      ocrRunnable,
      ocrAttempted,
      ocrError,
      pdfOcrDebug: ocrResult.debug,
      ocrRawTextLen: ocrRawLen,
      forceOcrPage1Debug: forcePage1,
      ocrPage1RawText: forcePage1 ? (ocrResult.text ?? "") : undefined,
      finalTextLen: textOut.length,
      extractionSource: extractionSourceOut,
      parseHeuristicsInputLen: parseInput.length,
      parseHeuristicsReceivedOcrText: parseReceivedOcr,
      suggestionFieldKeys: suggestionKeys(suggestions),
      suggestedFieldPreview: suggestionPreview(suggestions),
      failureStep,
      parseInputFirst500: parseInput.slice(0, 500),
      directTextPreview: directText.slice(0, 500),
      ocrTextPreview: (ocrResult.text ?? "").slice(0, 500),
      finalParsePreview: parseInput.slice(0, 500),
    };
  }
  if (shouldLogPipeline()) {
    console.log("[resume pipeline] quality", { quality: result.quality });
  }
  return result;
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
