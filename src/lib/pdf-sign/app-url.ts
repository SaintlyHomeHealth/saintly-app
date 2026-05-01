import "server-only";

function publicAppOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

export function buildPdfSignRecipientUrl(rawToken: string): string {
  const base = publicAppOrigin();
  if (!base) return `/sign/${encodeURIComponent(rawToken)}`;
  return `${base}/sign/${encodeURIComponent(rawToken)}`;
}
