import "server-only";

/** Private bucket for sales agent chat attachments (PHI — signed URLs only). */
export const SALES_AGENT_CHAT_ATTACHMENTS_BUCKET = "sales-agent-chat-attachments";

export const SALES_AGENT_CHAT_ATTACHMENT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const SALES_AGENT_CHAT_ATTACHMENT_MAX_DOC_BYTES = 15 * 1024 * 1024;

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function isAllowedSalesAgentChatAttachmentMime(mime: string): boolean {
  const t = mime.trim().toLowerCase();
  return ALLOWED.has(t);
}

export function maxBytesForSalesAgentChatAttachmentMime(mime: string): number {
  const t = mime.trim().toLowerCase();
  if (t === "application/pdf" || t.includes("word") || t === "application/msword") {
    return SALES_AGENT_CHAT_ATTACHMENT_MAX_DOC_BYTES;
  }
  return SALES_AGENT_CHAT_ATTACHMENT_MAX_IMAGE_BYTES;
}

export function isSalesAgentChatImageMime(mime: string | null | undefined): boolean {
  const t = (mime ?? "").trim().toLowerCase();
  return t.startsWith("image/");
}

export function salesAgentChatAttachmentFileRoute(attachmentId: string): string {
  return `/api/sales-agent-chat/attachments/${encodeURIComponent(attachmentId)}/file`;
}
