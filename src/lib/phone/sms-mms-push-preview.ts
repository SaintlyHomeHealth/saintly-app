import "server-only";

/**
 * Compact label for inbound push when MMS has no SMS body yet.
 * Mirrors inbox copy (“Photo” vs “Attachment”) for recognizable notifications.
 */
export function resolveInboundSmsAttachmentPushPreview(
  body: string,
  params: Record<string, string>
): string | null {
  if (typeof body === "string" && body.trim() !== "") {
    return null;
  }
  const nRaw = (params.NumMedia ?? "0").trim();
  const n = Number.parseInt(nRaw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }

  let imageCount = 0;
  let otherCount = 0;
  const cap = Math.min(n, 10);
  for (let i = 0; i < cap; i++) {
    const ct =
      typeof params[`MediaContentType${i}`] === "string"
        ? params[`MediaContentType${i}`]!.split(";")[0]!.trim().toLowerCase()
        : "";
    if (ct.startsWith("image/")) {
      imageCount += 1;
    } else if (ct) {
      otherCount += 1;
    } else {
      otherCount += 1;
    }
  }

  if (imageCount > 0 && otherCount === 0) return "Photo";
  return "Attachment";
}
