/** Cached logo for fax cover PDF embedding. */
let cachedLogo: { bytes: Uint8Array; kind: "png" | "jpeg" } | null | undefined;

const LOGO_FILES = [
  "saintly-logo.png",
  "saintly-home-health-app-icon.png",
  "brand/saintly-home-health-app-icon.png",
] as const;

function sniffImageKind(bytes: Uint8Array): "png" | "jpeg" | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "jpeg";
  }
  return null;
}

async function readPublicFile(relativePath: string): Promise<Uint8Array | null> {
  try {
    if (typeof window === "undefined") {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      return new Uint8Array(await readFile(join(process.cwd(), "public", relativePath)));
    }
    const res = await fetch(`/${relativePath}`, { cache: "force-cache" });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Load Saintly logo bytes for pdf-lib embedding.
 * Note: public/saintly-logo.png is JPEG data with a .png extension; we sniff magic bytes.
 */
export async function loadSaintlyLogoForPdf(): Promise<{ bytes: Uint8Array; kind: "png" | "jpeg" } | null> {
  if (cachedLogo !== undefined) return cachedLogo;

  for (const file of LOGO_FILES) {
    const bytes = await readPublicFile(file);
    if (!bytes?.length) continue;
    const kind = sniffImageKind(bytes);
    if (kind) {
      cachedLogo = { bytes, kind };
      return cachedLogo;
    }
  }

  // TODO: No embeddable Saintly logo found under public/ — verify saintly-logo.png or brand PNG assets exist.
  cachedLogo = null;
  return null;
}

/** @deprecated Use loadSaintlyLogoForPdf — kept for callers expecting PNG-only loader. */
export async function loadSaintlyLogoPngBytes(): Promise<Uint8Array | null> {
  const logo = await loadSaintlyLogoForPdf();
  return logo?.bytes ?? null;
}
