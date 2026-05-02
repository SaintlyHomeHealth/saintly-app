import "server-only";

/** Max image upload size (bytes). */
export const CHAT_ATTACHMENT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Max PDF upload size (bytes). */
export const CHAT_ATTACHMENT_MAX_PDF_BYTES = 15 * 1024 * 1024;

const SUPPORTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
]);

export function isAllowedChatAttachmentContentType(ct: string): boolean {
  const t = ct.trim().toLowerCase();
  return SUPPORTED.has(t);
}

export function maxBytesForChatAttachmentContentType(ct: string): number {
  const t = ct.trim().toLowerCase();
  if (t === "application/pdf") {
    return CHAT_ATTACHMENT_MAX_PDF_BYTES;
  }
  return CHAT_ATTACHMENT_MAX_IMAGE_BYTES;
}

export function chatAttachmentDebugEnabled(): boolean {
  return process.env.INTERNAL_CHAT_ATTACHMENTS_DEBUG === "1";
}
