import "server-only";

type LogoBytes = { bytes: Uint8Array; kind: "png" | "jpeg" };

let cache: { icon: LogoBytes | null; wordmark: LogoBytes | null } | undefined;

function sniffImageKind(bytes: Uint8Array): "png" | "jpeg" | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "jpeg";
  }
  return null;
}

async function readPublic(candidates: readonly string[]): Promise<LogoBytes | null> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  for (const file of candidates) {
    try {
      const bytes = new Uint8Array(await readFile(join(process.cwd(), "public", file)));
      const kind = sniffImageKind(bytes);
      if (kind && bytes.length) return { bytes, kind };
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Load the Saintly brand marks for premium PDF headers:
 *  - icon: the halo "house" mark (transparent PNG)
 *  - wordmark: the "SAINTLY HOME HEALTH" lockup
 * Cached after first read. Returns nulls gracefully if a file is missing.
 */
export async function loadPrivatePayBrandLogos(): Promise<{
  icon: LogoBytes | null;
  wordmark: LogoBytes | null;
}> {
  if (cache !== undefined) return cache;
  const [icon, wordmark] = await Promise.all([
    readPublic(["saintly-icon-halo.png", "saintly-home-health-app-icon.png", "icon-1024.png"]),
    readPublic(["saintly-wordmark.png"]),
  ]);
  cache = { icon, wordmark };
  return cache;
}
