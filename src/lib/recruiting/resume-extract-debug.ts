import "server-only";

/** Verbose resume extract / OCR logs (server) and optional debug payloads. */
export function isResumeExtractDebugEnabled(): boolean {
  return process.env.RECRUITING_RESUME_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development";
}

/** Dev-only endpoint for OCR pipeline inspection. */
export function isResumeOcrDebugEndpointEnabled(): boolean {
  return process.env.RECRUITING_RESUME_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development";
}
