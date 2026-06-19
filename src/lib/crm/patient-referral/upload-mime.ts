export const PATIENT_REFERRAL_MAX_BYTES = 10 * 1024 * 1024;

export const PATIENT_REFERRAL_ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".heic", ".heif"] as const;

export const PATIENT_REFERRAL_ACCEPT_ATTR =
  ".pdf,.png,.jpg,.jpeg,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif";

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

export const PATIENT_REFERRAL_HARD_ERROR_CHOOSE_FILE = "Choose a referral document to upload.";
export const PATIENT_REFERRAL_HARD_ERROR_INVALID_FILE =
  "Invalid file type. Accepted: PDF, PNG, JPG/JPEG, HEIC (max 10 MB).";
export const PATIENT_REFERRAL_HARD_ERROR_TOO_LARGE = "File is too large (max 10 MB).";
export const PATIENT_REFERRAL_SOFT_MANUAL_PARSE =
  "We could not read all fields from this document. You can still enter the missing information manually.";

export function patientReferralHasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return PATIENT_REFERRAL_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function patientReferralFileMimeFromFile(file: File): string {
  const t = (file.type ?? "").trim();
  if (t) return t;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "application/octet-stream";
}

export function normalizePatientReferralBaseMime(mime: string): string {
  return mime.toLowerCase().split(";")[0]?.trim() || "application/octet-stream";
}

export function isPatientReferralMimeAllowed(mime: string, filename: string): boolean {
  const base = normalizePatientReferralBaseMime(mime);
  if (ALLOWED_MIMES.has(base)) return true;
  return patientReferralHasAllowedExtension(filename);
}

export function sanitizePatientReferralFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "referral";
  const cleaned = base.replace(/[^a-zA-Z0-9._\- ]/g, "_").trim();
  return cleaned.slice(0, 180) || "referral";
}

export function guessPatientReferralContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "application/octet-stream";
}

export function isPatientReferralImageFilename(filename: string, mime?: string): boolean {
  const base = normalizePatientReferralBaseMime(mime ?? "");
  if (base.startsWith("image/")) return true;
  const lower = filename.toLowerCase();
  return [".png", ".jpg", ".jpeg", ".heic", ".heif", ".webp"].some((ext) => lower.endsWith(ext));
}

export function isPatientReferralPdfFilename(filename: string, mime?: string): boolean {
  const base = normalizePatientReferralBaseMime(mime ?? "");
  if (base === "application/pdf") return true;
  return filename.toLowerCase().endsWith(".pdf");
}
