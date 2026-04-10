import "server-only";

import { PDFParse } from "pdf-parse";

/**
 * OCR.space file upload API — **server-only** (import only from Route Handlers / Server Actions).
 * `OCR_SPACE_API_KEY` must never be prefixed with `NEXT_PUBLIC_` and must not be imported by client components.
 *
 * Free tier (enforced here): max 1 MB file, max 3 PDF pages.
 *
 * @see https://ocr.space/ocrapi
 */

const OCR_SPACE_PARSE_URL = "https://api.ocr.space/parse/image";

/** Free-tier limits we enforce before calling the API (avoid wasted calls / hard API errors). */
export const OCR_SPACE_FREE_MAX_BYTES = 1024 * 1024;
export const OCR_SPACE_FREE_MAX_PAGES = 3;

export type OcrSpaceSkipReason = "file_too_large" | "too_many_pages";

/** User-facing copy when the file exceeds OCR.space free-tier limits (size or page count). */
export const OCR_SPACE_FREE_TIER_LIMIT_USER_MESSAGE =
  "This scanned resume is larger than the current OCR limit. You can still create the candidate manually.";

export type OcrSpaceDebug = {
  skipReason?: OcrSpaceSkipReason;
  pdfNumPages?: number;
  fileBytes?: number;
  httpStatus?: number;
  ocrExitCode?: number;
  apiCalled?: boolean;
};

export type OcrSpaceResult = {
  text: string;
  error?: string;
  debug?: OcrSpaceDebug;
};

function ocrSpaceExplicitlyDisabled(): boolean {
  const v = process.env.RECRUITING_RESUME_OCR_SPACE_ENABLED?.trim().toLowerCase();
  return v === "false" || v === "0" || v === "no";
}

export function isOcrSpaceRecruitingConfigured(): boolean {
  if (ocrSpaceExplicitlyDisabled()) return false;
  return Boolean(process.env.OCR_SPACE_API_KEY?.trim());
}

async function getPdfPageCount(buffer: Buffer): Promise<number | null> {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo();
    return typeof info.total === "number" ? info.total : null;
  } catch {
    return null;
  } finally {
    await parser.destroy();
  }
}

type OcrSpaceJson = {
  OCRExitCode?: number;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[] | null;
  ParsedResults?: Array<{ ParsedText?: string }>;
};

function normalizeErrorMessage(raw: string | string[] | null | undefined): string {
  if (raw == null) return "";
  if (Array.isArray(raw)) return raw.filter(Boolean).join(" — ");
  return String(raw);
}

function extractParsedText(data: OcrSpaceJson): string {
  const parts = (data.ParsedResults ?? [])
    .map((r) => r.ParsedText?.trim())
    .filter((t): t is string => Boolean(t));
  return parts.join("\n\n").trim();
}

/**
 * Run OCR.space on a resume buffer. PDFs are checked for free-tier size/page limits first.
 * Returns empty text + error on failure; never throws.
 */
export async function ocrSpaceFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<OcrSpaceResult> {
  const debug: OcrSpaceDebug = { fileBytes: buffer.byteLength };

  if (!isOcrSpaceRecruitingConfigured()) {
    return { text: "", error: "OCR.space not configured (OCR_SPACE_API_KEY)", debug };
  }

  const apiKey = process.env.OCR_SPACE_API_KEY!.trim();
  const lower = filename.toLowerCase();
  const baseMime = (mimeType ?? "application/octet-stream").split(";")[0]?.trim() || "application/octet-stream";

  if (buffer.byteLength > OCR_SPACE_FREE_MAX_BYTES) {
    const skipReason: OcrSpaceSkipReason = "file_too_large";
    return {
      text: "",
      error: OCR_SPACE_FREE_TIER_LIMIT_USER_MESSAGE,
      debug: { ...debug, skipReason },
    };
  }

  if (lower.endsWith(".pdf")) {
    const n = await getPdfPageCount(buffer);
    debug.pdfNumPages = n ?? undefined;
    if (n != null && n > OCR_SPACE_FREE_MAX_PAGES) {
      const skipReason: OcrSpaceSkipReason = "too_many_pages";
      return {
        text: "",
        error: OCR_SPACE_FREE_TIER_LIMIT_USER_MESSAGE,
        debug: { ...debug, skipReason, pdfNumPages: n },
      };
    }
  }

  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: baseMime });
    form.append("file", blob, filename);
    form.append("language", "eng");
    form.append("isOverlayRequired", "false");
    form.append("OCREngine", "2");

    debug.apiCalled = true;

    const res = await fetch(OCR_SPACE_PARSE_URL, {
      method: "POST",
      headers: {
        apikey: apiKey,
      },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    debug.httpStatus = res.status;

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return {
        text: "",
        error: `OCR.space HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 200)}` : ""}`,
        debug,
      };
    }

    const data = (await res.json()) as OcrSpaceJson;
    debug.ocrExitCode = data.OCRExitCode;

    const text = extractParsedText(data);
    if (text) {
      return { text: text.slice(0, 120_000), debug };
    }

    if (data.IsErroredOnProcessing) {
      const em = normalizeErrorMessage(data.ErrorMessage);
      return {
        text: "",
        error: em || "OCR.space reported a processing error",
        debug,
      };
    }

    const em = normalizeErrorMessage(data.ErrorMessage);
    if (em) {
      return { text: "", error: em, debug };
    }

    return {
      text: "",
      error: "OCR.space returned no text",
      debug,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: "", error: `OCR.space request failed: ${msg}`, debug };
  }
}
