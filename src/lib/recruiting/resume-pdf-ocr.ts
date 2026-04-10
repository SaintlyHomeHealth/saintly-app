import "server-only";

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canRunResumePdfOcr, getBundledTesseractEngLangDir } from "@/lib/recruiting/recruiting-ocr-env";

/**
 * OCR for image-based PDFs (no text layer). Server-only: pdf.js + node canvas + tesseract.
 * Language + WASM load from node_modules only (no runtime downloads).
 */

const MAX_OCR_PAGES = 5;
const MAX_CANVAS_EDGE = 2400;
const RENDER_SCALE = 2;

export type PdfOcrResult = {
  text: string;
  /** Set when OCR could not run; does not imply upload failure */
  error?: string;
};

let workerSrcSet = false;

async function ensurePdfWorker(): Promise<void> {
  if (workerSrcSet) return;
  const require = createRequire(import.meta.url);
  const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const workerPath = path.join(pdfRoot, "build", "pdf.worker.mjs");
  const { GlobalWorkerOptions } = await import("pdfjs-dist/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  workerSrcSet = true;
}

/**
 * Render up to MAX_OCR_PAGES and run Tesseract on each page. Returns concatenated text.
 * If OCR is disabled or dependencies are missing, returns empty text without throwing.
 */
export async function ocrPdfBuffer(buffer: Buffer): Promise<PdfOcrResult> {
  if (!canRunResumePdfOcr()) {
    return { text: "" };
  }

  const langDir = getBundledTesseractEngLangDir();
  if (!langDir) {
    return { text: "", error: "Bundled OCR language data is not available." };
  }

  await ensurePdfWorker();

  let createCanvas: typeof import("canvas").createCanvas;
  try {
    const canvasMod = await import("canvas");
    createCanvas = canvasMod.createCanvas;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "canvas unavailable";
    return { text: "", error: `OCR skipped (${msg})` };
  }

  const { getDocument } = await import("pdfjs-dist/build/pdf.mjs");
  const { createWorker, OEM } = await import("tesseract.js");

  const data = new Uint8Array(buffer.length);
  data.set(buffer);
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
  });

  let pdf: Awaited<ReturnType<typeof loadingTask.promise>> | null = null;
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    pdf = await loadingTask.promise;
    const numPages = Math.min(pdf.numPages, MAX_OCR_PAGES);
    const parts: string[] = [];

    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      langPath: langDir,
      gzip: true,
      cacheMethod: "none",
    });

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      let scale = RENDER_SCALE;
      const w = baseViewport.width * scale;
      const h = baseViewport.height * scale;
      const maxEdge = Math.max(w, h);
      if (maxEdge > MAX_CANVAS_EDGE) {
        scale *= MAX_CANVAS_EDGE / maxEdge;
      }
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page
        .render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
        })
        .promise;

      const png = canvas.toBuffer("image/png");
      const {
        data: { text: pageText },
      } = await worker.recognize(png);
      if (pageText?.trim()) {
        parts.push(pageText.trim());
      }
    }

    return { text: parts.join("\n\n").trim() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OCR failed";
    return { text: "", error: msg };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* ignore */
      }
    }
    if (pdf) {
      try {
        await pdf.destroy();
      } catch {
        /* ignore */
      }
    }
  }
}
