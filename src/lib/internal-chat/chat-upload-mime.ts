import {
  isAllowedChatAttachmentContentType,
} from "@/lib/internal-chat/chat-attachment-constants";

/**
 * Resolve a supported MIME type from `File.type` and filename fallback (Safari sometimes omits HEIC type).
 */
export function mapSafeChatContentTypeFromFile(file: File): string | null {
  const t = (file.type ?? "").trim().toLowerCase();
  if (t && isAllowedChatAttachmentContentType(t)) {
    return t;
  }
  const n = file.name.trim().toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".heic") || n.endsWith(".heif")) return "image/heic";
  if (/\.(jpe?g)$/.test(n)) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  return null;
}
