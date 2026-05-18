#!/usr/bin/env node
/**
 * Copies the pdfjs-dist worker bundle into /public so we can serve it from the
 * same origin as the app. Run automatically via `postinstall`, `predev`,
 * `prebuild`. Keeps the worker version in lockstep with the installed
 * `pdfjs-dist` package so we never load a CDN URL that might be down or
 * mismatched.
 *
 * Why the legacy build? `src/lib/pdf-sign/pdfjs-browser.ts` and the server-side
 * suggester both import `pdfjs-dist/legacy/build/pdf.mjs`, which expects the
 * matching legacy worker.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function findWorkerSource() {
  const requireFn = createRequire(import.meta.url);
  let pkgPath;
  try {
    pkgPath = requireFn.resolve("pdfjs-dist/package.json");
  } catch (e) {
    console.warn("[sync-pdfjs-worker] pdfjs-dist not installed yet; skipping.");
    return null;
  }
  const pkgRoot = dirname(pkgPath);
  const candidates = [
    resolve(pkgRoot, "legacy/build/pdf.worker.min.mjs"),
    resolve(pkgRoot, "legacy/build/pdf.worker.mjs"),
    resolve(pkgRoot, "build/pdf.worker.min.mjs"),
    resolve(pkgRoot, "build/pdf.worker.mjs"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function main() {
  const src = findWorkerSource();
  if (!src) {
    console.warn("[sync-pdfjs-worker] No pdfjs worker bundle found; skipping.");
    return;
  }
  const dest = resolve(projectRoot, "public", "pdf.worker.min.mjs");
  mkdirSync(dirname(dest), { recursive: true });
  // Avoid rewriting the file if it's already up to date (keeps git diffs clean).
  if (existsSync(dest)) {
    const a = statSync(src);
    const b = statSync(dest);
    if (a.size === b.size && a.mtimeMs <= b.mtimeMs) {
      return;
    }
  }
  copyFileSync(src, dest);
  console.log(`[sync-pdfjs-worker] copied ${src} → ${dest}`);
}

main();
