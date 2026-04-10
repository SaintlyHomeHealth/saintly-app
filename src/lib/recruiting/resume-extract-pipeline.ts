import "server-only";

import { RESUME_SOFT_MANUAL_PARSE_CREATE } from "@/lib/recruiting/resume-upload-mime";
import { isForceOcrPage1DebugMode, isResumeExtractDebugEnabled } from "@/lib/recruiting/resume-extract-debug";
import { canRunResumePdfOcr } from "@/lib/recruiting/recruiting-ocr-env";
import { isOcrSpaceRecruitingConfigured, ocrSpaceFromBuffer } from "@/lib/recruiting/ocr-space";
import { parseResumePlainText } from "@/lib/recruiting/resume-parse-heuristics";
import type { ParsedResumeSuggestions, ResumeParseQuality } from "@/lib/recruiting/resume-parse-types";
import type { PdfOcrDebug, PdfOcrResult } from "@/lib/recruiting/resume-pdf-ocr";
import { ocrPdfBuffer } from "@/lib/recruiting/resume-pdf-ocr";
import { getLastNativeCanvasLoadError, isNativePdfOcrCanvasAvailable } from "@/lib/recruiting/napi-canvas-runtime";
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
  | "native_canvas_unavailable"
  | "scanned_pdf_ocr_unavailable"
  | "ocr_space_skipped_limits"
  | "ocr_space_failed"
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
  /** Tesseract bundle + env allow OCR (`canRunResumePdfOcr`) */
  ocrRuntimeAvailable: boolean;
  /** `@napi-rs/canvas` loaded successfully for this request */
  canvasRuntimeLoaded: boolean;
  /** Native canvas require error when canvas did not load (production diagnostics) */
  canvasRuntimeError?: string;
  /** Pages successfully rendered + OCR'd */
  pagesRenderedForOcr: number;
  /** OCR.space (when configured) */
  ocrSpaceConfigured: boolean;
  /** True when OCR.space HTTP API was called */
  ocrSpaceAttempted: boolean;
  ocrSpaceSkippedLimits: boolean;
  ocrSpaceTextLen: number;
  ocrSpaceError?: string;
  /** Set when OCR.space returned usable text */
  ocrSource?: "ocr.space";
};

export const RESUME_STATUS_HEADLINE_SCANNED_NO_NATIVE_OCR =
  "This resume appears to be image-based (scanned). Auto-fill may be limited — please review and complete the fields below.";

export type ResumeExtractPipelineResult = {
  text: string;
  extractionSource: ResumeExtractionSource;
  quality: ResumeParseQuality;
  suggestions: ParsedResumeSuggestions | null;
  directError?: string;
  ocrError?: string;
  /** Short UI lines for banners */
  messages: string[];
  /** Overrides default parse banner title when set (e.g. scanned PDF without native canvas) */
  statusHeadline?: string;
  /** Present when `includeDebugSummaryAlways` or dev/debug `includeDebug` requests metrics */
  debug?: ResumeExtractDebugSummary;
  /** When force page-1 OCR debug ran: raw text from Tesseract (page 1 only) */
  ocrPage1RawText?: string;
  forceOcrPage1Debug?: boolean;
};

export type ResumeExtractPipelineOptions = {
  mimeType?: string;
  includeDebug?: boolean;
  /**
   * When true, always attach `debug` on the pipeline result (metrics + previews)
   * even in production. Used by parse-only for observability; does not enable verbose console logs.
   */
  includeDebugSummaryAlways?: boolean;
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
 * Opt-in: pdf.js + canvas + Tesseract. Never used on Vercel — local/dev/debug only.
 * Requires `RECRUITING_RESUME_NATIVE_PDF_OCR` plus non-Vercel host and (development
 * or `RECRUITING_RESUME_NATIVE_PDF_OCR_DEBUG=1` for e.g. `next start` locally).
 */
function isNativePdfOcrEnabled(): boolean {
  const v = process.env.RECRUITING_RESUME_NATIVE_PDF_OCR?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function isVercelDeployment(): boolean {
  return Boolean(process.env.VERCEL);
}

/** Native canvas OCR is allowed only off Vercel (local `next dev` / self-hosted) or with explicit debug flag. */
function isNativePdfOcrDevOrLocalOnly(): boolean {
  if (isVercelDeployment()) return false;
  if (process.env.NODE_ENV === "development") return true;
  const v = process.env.RECRUITING_RESUME_NATIVE_PDF_OCR_DEBUG?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function nativePdfOcrBackendReady(): boolean {
  if (!isNativePdfOcrDevOrLocalOnly()) return false;
  return canRunResumePdfOcr() && isNativePdfOcrEnabled() && isNativePdfOcrCanvasAvailable();
}

function anyPdfOcrBackendAvailable(): boolean {
  return isOcrSpaceRecruitingConfigured() || nativePdfOcrBackendReady();
}

/**
 * PDF only — whether direct extraction looks image-based / weak (independent of OCR backend availability).
 * **Important:** Do not skip OCR solely because direct text length ≥ 200 — scanned PDFs often embed junk text.
 */
function pdfNeedsOcrByHeuristics(directText: string, filename: string): boolean {
  if (!isPdfFilename(filename)) return false;

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

/** True when heuristics say OCR is needed and a backend exists (OCR.space in production; native only in dev/local). */
function shouldRunPdfOcrThisRequest(directText: string, filename: string): boolean {
  return pdfNeedsOcrByHeuristics(directText, filename) && anyPdfOcrBackendAvailable();
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
  /** PDF would need OCR for text but native canvas did not load — do not imply silent failure */
  nativeCanvasUnavailable?: boolean;
};

function buildMessages(quality: ResumeParseQuality, ctx?: MessageCtx): string[] {
  switch (quality) {
    case "parsed_ok":
      return ["Parsed successfully."];
    case "limited_parse": {
      if (ctx?.nativeCanvasUnavailable && ctx.ocrApplicable && ctx.ocrRunnable) {
        return [
          RESUME_STATUS_HEADLINE_SCANNED_NO_NATIVE_OCR,
          "Review and edit suggested fields before saving.",
        ];
      }
      return ["Limited parse — review and edit fields before saving."];
    }
    case "ocr_success":
      return ["Image-based resume — OCR was used to read text.", "Review suggestions before saving."];
    case "ocr_limited":
      return [
        "Image-based resume — OCR was used, but auto-fill is partial.",
        "Resume uploaded, but we could not auto-read enough text for full suggestions — edit fields as needed.",
      ];
    case "manual": {
      if (ctx?.nativeCanvasUnavailable && ctx.ocrApplicable && ctx.ocrRunnable) {
        return [RESUME_STATUS_HEADLINE_SCANNED_NO_NATIVE_OCR];
      }
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
  directText: string;
  filename: string;
  ocrRunnable: boolean;
  ocrAttempted: boolean;
  ocrSpaceAttempted: boolean;
  ocrSpaceSkippedLimits: boolean;
  ocrSpaceTextLen: number;
  ocrSpaceConfigured: boolean;
  nativeOcrBackendReady: boolean;
  ocr: PdfOcrResult;
  pickedTextLen: number;
  parseInputLen: number;
  suggestions: ParsedResumeSuggestions | null;
  isPdf: boolean;
}): ResumeExtractFailureStep {
  const {
    directLen,
    directText,
    filename,
    ocrRunnable,
    ocrAttempted,
    ocrSpaceAttempted,
    ocrSpaceSkippedLimits,
    ocrSpaceTextLen,
    ocrSpaceConfigured,
    nativeOcrBackendReady,
    ocr,
    pickedTextLen,
    parseInputLen,
    suggestions,
    isPdf,
  } = args;
  const ocrLen = (ocr.text ?? "").trim().length;
  const dbg = ocr.debug;

  if (
    isPdf &&
    pdfNeedsOcrByHeuristics(directText, filename) &&
    !ocrAttempted &&
    !ocrSpaceConfigured &&
    !nativeOcrBackendReady
  ) {
    return "scanned_pdf_ocr_unavailable";
  }

  if (ocrSpaceSkippedLimits && pickedTextLen < MIN_USABLE_TEXT_LEN) {
    return "ocr_space_skipped_limits";
  }

  if (ocrSpaceAttempted && ocrSpaceTextLen === 0 && pickedTextLen < MIN_USABLE_TEXT_LEN) {
    return "ocr_space_failed";
  }

  /** Junk direct text (e.g. page markers) can exceed min length while every page render fails — still OCR-blocked */
  if (ocrAttempted && !ocrSpaceAttempted && ocrLen === 0 && dbg?.pages?.length) {
    const allRenderFailed = dbg.pages.every((p) => p.renderLikelyFailed);
    if (allRenderFailed) return "pdf_render_failed";
  }

  if (pickedTextLen < MIN_USABLE_TEXT_LEN) {
    if (directLen === 0 && !ocrAttempted) {
      return ocrRunnable ? "direct_extraction_empty" : "ocr_disabled_or_unavailable";
    }
    if (!ocrRunnable && ocrAttempted === false) return "ocr_disabled_or_unavailable";
    if (ocrAttempted && !ocrSpaceAttempted && dbg && !dbg.workerInitOk) return "ocr_init_failed";
    if (ocrAttempted && !ocrSpaceAttempted && dbg?.pages?.length) {
      const allBad = dbg.pages.every((p) => p.renderLikelyFailed);
      if (allBad) return "pdf_render_failed";
    }
    if (ocrAttempted && ocrLen === 0) {
      if (ocrSpaceAttempted) return "ocr_space_failed";
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
    const ocrRunnable =
      isOcrSpaceRecruitingConfigured() || nativePdfOcrBackendReady();
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
  const includeDebugSummary =
    Boolean(options?.includeDebugSummaryAlways) ||
    ((Boolean(options?.includeDebug) || Boolean(options?.forceOcrPage1Debug)) && shouldLogPipeline());

  const direct = await extractResumeText(buffer, filename);
  const directText = (direct.text ?? "").trim();

  const ocrApplicable = isPdfFilename(filename);
  const ocrSpaceConfigured = isOcrSpaceRecruitingConfigured();
  const nativeOcrReady = nativePdfOcrBackendReady();
  const ocrRunnable = ocrSpaceConfigured || nativeOcrReady;
  const nativeCanvasAvailable = isNativePdfOcrCanvasAvailable();
  let ocrSpaceAttempted = false;
  let ocrSpaceSkippedLimits = false;
  let ocrSpaceTextLen = 0;
  let ocrSpaceError: string | undefined;
  let ocrSource: "ocr.space" | undefined;
  let ocrAttempted = false;
  let ocrError: string | undefined;
  let ocrRawLen = 0;
  let ocrResult: PdfOcrResult = { text: "" };

  let text = directText;
  let extractionSource: ResumeExtractionSource = "direct";

  const runOcrSpace = async () => {
    ocrAttempted = true;
    const r = await ocrSpaceFromBuffer(buffer, filename, mimeType);
    ocrSpaceTextLen = r.text.trim().length;
    ocrSpaceError = r.error;
    if (r.debug?.apiCalled) ocrSpaceAttempted = true;
    if (r.debug?.skipReason) ocrSpaceSkippedLimits = true;
    ocrResult = { text: r.text, error: r.error };
    ocrRawLen = ocrSpaceTextLen;
    if (r.error) ocrError = r.error;
    if (ocrSpaceTextLen > 0) ocrSource = "ocr.space";
  };

  if (forcePage1 && ocrApplicable && ocrRunnable) {
    if (ocrSpaceConfigured) {
      await runOcrSpace();
    } else if (nativeOcrReady) {
      ocrAttempted = true;
      ocrResult = await ocrPdfBuffer(buffer, {
        filename,
        mimeType,
        maxPages: 1,
        forceDebug: true,
      });
      ocrRawLen = (ocrResult.text ?? "").trim().length;
      if (ocrResult.error) ocrError = ocrResult.error;
    }
    const picked = pickBestText(directText, ocrResult.text ?? "", ocrAttempted);
    text = picked.text;
    extractionSource = picked.source;
  } else if (shouldRunPdfOcrThisRequest(directText, filename)) {
    if (ocrSpaceConfigured) {
      await runOcrSpace();
    } else if (nativeOcrReady) {
      ocrAttempted = true;
      ocrResult = await ocrPdfBuffer(buffer, {
        filename,
        mimeType,
        forceDebug: shouldLogPipeline(),
      });
      ocrRawLen = (ocrResult.text ?? "").trim().length;
      if (ocrResult.error) ocrError = ocrResult.error;
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
    nativeCanvasUnavailable:
      ocrApplicable &&
      pdfNeedsOcrByHeuristics(directText, filename) &&
      ((!ocrSpaceConfigured && !nativeOcrReady) || (ocrAttempted && ocrRawLen === 0)),
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
      ocrSpaceConfigured,
      ocrSpaceAttempted,
      ocrSpaceSkippedLimits,
      ocrSpaceTextLen,
      ocrSpaceError: ocrSpaceError ?? null,
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
    directText,
    filename,
    ocrRunnable,
    ocrAttempted,
    ocrSpaceAttempted,
    ocrSpaceSkippedLimits,
    ocrSpaceTextLen,
    ocrSpaceConfigured,
    nativeOcrBackendReady: nativeOcrReady,
    ocr: ocrResult,
    pickedTextLen: textOut.length,
    parseInputLen: parseInput.length,
    suggestions,
    isPdf: ocrApplicable,
  });

  const scannedHeadlineFailure =
    failureStep === "scanned_pdf_ocr_unavailable" ||
    failureStep === "ocr_space_failed" ||
    failureStep === "ocr_space_skipped_limits" ||
    failureStep === "native_canvas_unavailable";

  const statusHeadline = scannedHeadlineFailure
    ? RESUME_STATUS_HEADLINE_SCANNED_NO_NATIVE_OCR
    : undefined;

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
      ...(statusHeadline ? { statusHeadline } : {}),
      ...(forcePage1 && ocrApplicable && (includeDebugSummary || options?.forceOcrPage1Debug)
        ? {
            forceOcrPage1Debug: true,
            ocrPage1RawText: ocrResult.text ?? "",
          }
        : {}),
    };
    if (includeDebugSummary) {
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
        ocrRuntimeAvailable: canRunResumePdfOcr(),
        ocrSpaceConfigured,
        ocrSpaceAttempted,
        ocrSpaceSkippedLimits,
        ocrSpaceTextLen,
        ocrSpaceError,
        ocrSource,
        canvasRuntimeLoaded: ocrApplicable ? nativeCanvasAvailable : false,
        canvasRuntimeError:
          ocrApplicable && !nativeCanvasAvailable ? getLastNativeCanvasLoadError() : undefined,
        pagesRenderedForOcr: ocrAttempted ? (ocrResult.debug?.pagesRendered ?? 0) : 0,
      };
    }
    if (includeDebugSummary) {
      console.log(
        JSON.stringify({
          source: "resume-extract-pipeline/metrics",
          directTextLen: directText.length,
          ocrSpaceAttempted,
          ocrSpaceTextLen,
          ocrAttempted,
          ocrRawTextLen: ocrRawLen,
          quality: result.quality,
          failureStep,
        })
      );
    }
    if (shouldLogPipeline()) {
      console.log("[resume pipeline] quality", { quality: result.quality });
    }
    return result;
  }

  const quality = buildQuality(extractionSourceOut, textOut.length, suggestions);
  const headline =
    scannedHeadlineFailure ||
    (quality === "limited_parse" && msgCtx.nativeCanvasUnavailable && ocrApplicable && ocrRunnable)
      ? RESUME_STATUS_HEADLINE_SCANNED_NO_NATIVE_OCR
      : undefined;
  const result: ResumeExtractPipelineResult = {
    text: textOut,
    extractionSource: extractionSourceOut === "ocr" ? "ocr" : "direct",
    quality,
    suggestions,
    directError: direct.error,
    ocrError,
    messages: buildMessages(quality, msgCtx),
    ...(headline ? { statusHeadline: headline } : {}),
    ...(forcePage1 && ocrApplicable && (includeDebugSummary || options?.forceOcrPage1Debug)
      ? {
          forceOcrPage1Debug: true,
          ocrPage1RawText: ocrResult.text ?? "",
        }
      : {}),
  };
  if (includeDebugSummary) {
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
      ocrRuntimeAvailable: canRunResumePdfOcr(),
      ocrSpaceConfigured,
      ocrSpaceAttempted,
      ocrSpaceSkippedLimits,
      ocrSpaceTextLen,
      ocrSpaceError,
      ocrSource,
      canvasRuntimeLoaded: ocrApplicable ? nativeCanvasAvailable : false,
      canvasRuntimeError:
        ocrApplicable && !nativeCanvasAvailable ? getLastNativeCanvasLoadError() : undefined,
      pagesRenderedForOcr: ocrAttempted ? (ocrResult.debug?.pagesRendered ?? 0) : 0,
    };
  }
  if (includeDebugSummary) {
    console.log(
      JSON.stringify({
        source: "resume-extract-pipeline/metrics",
        directTextLen: directText.length,
        ocrSpaceAttempted,
        ocrSpaceTextLen,
        ocrAttempted,
        ocrRawTextLen: ocrRawLen,
        quality: result.quality,
        failureStep,
      })
    );
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
