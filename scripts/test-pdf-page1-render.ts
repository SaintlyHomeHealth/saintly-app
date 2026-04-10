/**
 * Minimal Node render test: pdf.js 5 + @napi-rs/canvas (same stack as resume OCR).
 *
 * Usage (repo root):
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/test-pdf-page1-render.ts /path/to/file.pdf
 *
 * Writes `.tmp/pdf-page1-test.png` under the repo and logs dimensions + non-white sample ratio.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { createCanvas } from "@napi-rs/canvas";

const RENDER_SCALE = 2;
const MAX_EDGE = 2400;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_PATH = join(REPO_ROOT, ".tmp", "pdf-page1-test.png");

function sampleNonWhite(
  canvas: { width: number; height: number; getContext: (id: "2d") => { getImageData: (x: number, y: number, w: number, h: number) => ImageData } | null }
): number {
  const ctx = canvas.getContext("2d");
  if (!ctx?.getImageData) return 0;
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return 0;
  const step = Math.max(4, Math.floor(Math.max(w, h) / 120));
  let nonWhite = 0;
  let total = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      total++;
      const d = ctx.getImageData(x, y, 1, 1).data;
      const r = d[0] ?? 255;
      const g = d[1] ?? 255;
      const b = d[2] ?? 255;
      if (r < 248 || g < 248 || b < 248) nonWhite++;
    }
  }
  return total ? nonWhite / total : 0;
}

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error("Usage: NODE_OPTIONS='--conditions=react-server' npx tsx scripts/test-pdf-page1-render.ts <file.pdf>");
    process.exit(1);
  }

  const require = createRequire(import.meta.url);
  const pdfRoot = dirname(require.resolve("pdfjs-dist/package.json"));
  const workerPath = join(pdfRoot, "legacy", "build", "pdf.worker.mjs");
  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const buf = readFileSync(pdfPath);
  const data = new Uint8Array(buf.length);
  data.set(buf);

  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  let scale = RENDER_SCALE;
  const w0 = baseViewport.width * scale;
  const h0 = baseViewport.height * scale;
  const maxEdge = Math.max(w0, h0);
  if (maxEdge > MAX_EDGE) scale *= MAX_EDGE / maxEdge;
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("getContext('2d') returned null");
    process.exit(1);
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page
    .render({
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    })
    .promise;

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const png = canvas.toBuffer("image/png");
  writeFileSync(OUT_PATH, png);

  const ratio = sampleNonWhite(canvas);
  await pdf.destroy();

  console.log(JSON.stringify({
    inputPdf: pdfPath,
    pageRenderedOk: true,
    outputPngPath: OUT_PATH,
    width: canvas.width,
    height: canvas.height,
    nonWhiteSampleRatio: Number(ratio.toFixed(4)),
    pngBytes: png.length,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
