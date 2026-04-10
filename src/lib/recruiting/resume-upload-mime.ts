/**
 * Browser `File.type` often includes parameters, e.g. `application/pdf; charset=binary`.
 * Compare only the base MIME so valid uploads are not rejected.
 */
export function normalizeBaseMime(mime: string): string {
  const t = mime.trim();
  if (!t) return "";
  const semi = t.indexOf(";");
  return (semi >= 0 ? t.slice(0, semi) : t).trim().toLowerCase();
}

const ALLOWED_BASE = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
  "",
]);

export function isResumeMimeAllowed(mime: string, filename: string): boolean {
  const base = normalizeBaseMime(mime);
  if (ALLOWED_BASE.has(base)) return true;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx") && (base === "application/zip" || base === "application/x-zip-compressed")) {
    return true;
  }
  return false;
}

/** Use for all resume upload entry points (API routes + server actions). */
export function resumeFileMimeFromFile(file: File): string {
  return typeof file.type === "string" ? file.type : "";
}

// --- User-facing copy (keep in sync across parse-only, upload API, actions, UI) ---

/** Hard error: wrong extension, MIME, or other invalid file (before storage). */
export const RESUME_HARD_ERROR_INVALID_FILE =
  "Invalid file. Use PDF, DOC, or DOCX only (max 10 MB).";

export const RESUME_HARD_ERROR_CHOOSE_FILE = "Choose a resume file.";

export const RESUME_HARD_ERROR_TOO_LARGE = "File too large (max 10 MB).";

/** Soft: file accepted but text/OCR/heuristics did not yield enough to auto-fill (create-from-resume). */
export const RESUME_SOFT_MANUAL_PARSE_CREATE =
  "Resume uploaded, but we could not auto-read enough text. You can still create the candidate manually.";

/** Soft: same situation on candidate detail resume card. */
export const RESUME_SOFT_MANUAL_PARSE_PROFILE =
  "Resume uploaded, but we could not auto-read enough text. You can still edit the profile.";
