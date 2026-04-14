/** Supabase Storage bucket for payer credentialing ad-hoc attachments. */
export const PAYER_CREDENTIALING_STORAGE_BUCKET = "payer-credentialing";

/** Per-file max for credentialing attachment uploads (aligned with UI + server validation). */
export const PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const PAYER_CREDENTIALING_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/zip",
] as const;

export function sanitizePayerCredentialingFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

export function isAllowedPayerCredentialingMime(type: string): boolean {
  const t = type.trim().toLowerCase();
  return (PAYER_CREDENTIALING_ALLOWED_MIME_TYPES as readonly string[]).includes(t);
}
