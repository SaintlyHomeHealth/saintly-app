/** Display + stored `lead_attachments.category` values (exact match). */
export const LEAD_ATTACHMENT_CATEGORY_OPTIONS = [
  "Doctor's Orders",
  "Referral",
  "Insurance Card",
  "Authorization / PA",
  "Face-to-Face",
  "485 / Plan of Care",
  "Other",
] as const;

export type LeadAttachmentCategory = (typeof LEAD_ATTACHMENT_CATEGORY_OPTIONS)[number];

const CATEGORY_SET = new Set<string>(LEAD_ATTACHMENT_CATEGORY_OPTIONS);

export function isLeadAttachmentCategory(v: string): v is LeadAttachmentCategory {
  return CATEGORY_SET.has(v);
}

export const LEAD_ATTACHMENTS_BUCKET = "lead-attachments";

/** Max upload size for lead documents (PDF, images, office docs). */
export const LEAD_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

const MIME_ALLOW = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export function isAllowedLeadAttachmentContentType(mime: string): boolean {
  const t = mime.trim().toLowerCase();
  if (!t) return false;
  return MIME_ALLOW.has(t);
}
