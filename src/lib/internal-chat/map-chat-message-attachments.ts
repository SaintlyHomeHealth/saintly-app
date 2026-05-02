export type MappedChatAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
};

export function mapSupabaseNestedChatAttachments(raw: unknown): MappedChatAttachment[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: MappedChatAttachment[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    if (!id) continue;
    out.push({
      id,
      fileName: typeof r.file_name === "string" ? r.file_name : "file",
      contentType:
        typeof r.content_type === "string" ? r.content_type : "application/octet-stream",
      sizeBytes: typeof r.size_bytes === "number" ? r.size_bytes : null,
    });
  }
  return out;
}

export function listPreviewForChatAttachments(
  attachments: Pick<MappedChatAttachment, "contentType">[],
  legacyAttachmentMime: string | null,
  legacyAttachmentName: string | null
): string {
  const first = attachments[0];
  if (first) {
    const ct = (first.contentType ?? "").toLowerCase();
    if (ct.startsWith("image/")) return "Photo";
    if (ct === "application/pdf") return "PDF";
    return "Attachment";
  }
  if (legacyAttachmentName) {
    const mime = (legacyAttachmentMime ?? "").toLowerCase();
    if (mime.startsWith("image/")) return "Photo";
    if (mime === "application/pdf") return "PDF";
    const n = legacyAttachmentName.toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|heic)$/.test(n)) return "Photo";
    if (n.endsWith(".pdf")) return "PDF";
    return "Attachment";
  }
  return "";
}
