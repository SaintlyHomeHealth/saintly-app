import "server-only";

/** Verbose resume extract / OCR logs (server) and optional debug payloads. */
export function isResumeExtractDebugEnabled(): boolean {
  return process.env.RECRUITING_RESUME_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development";
}

/** Dev-only endpoint for OCR pipeline inspection. */
export function isResumeOcrDebugEndpointEnabled(): boolean {
  return process.env.RECRUITING_RESUME_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development";
}

/**
 * When `RECRUITING_RESUME_FORCE_OCR_PAGE1_DEBUG=1` and dev (or RECRUITING_RESUME_PARSE_DEBUG),
 * PDFs always run OCR on page 1 only and expose raw OCR text in debug payloads.
 * For local debugging of image-based resumes only — not for production UX.
 */
export function isForceOcrPage1DebugMode(): boolean {
  const v = process.env.RECRUITING_RESUME_FORCE_OCR_PAGE1_DEBUG?.trim().toLowerCase();
  if (v !== "1" && v !== "true" && v !== "yes") return false;
  return process.env.RECRUITING_RESUME_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development";
}
