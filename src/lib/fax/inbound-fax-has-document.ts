/** Client-safe: whether an inbound fax row has a PDF we can forward. */
export function inboundFaxHasDocumentForForward(row: {
  direction?: string | null;
  storage_path?: string | null;
  media_url?: string | null;
}): boolean {
  if (row.direction !== "inbound") return false;
  if (typeof row.storage_path === "string" && row.storage_path.trim()) return true;
  const media = typeof row.media_url === "string" ? row.media_url.trim() : "";
  return Boolean(media && media.startsWith("https://"));
}
