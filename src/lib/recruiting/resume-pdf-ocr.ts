import "server-only";

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isResumeExtractDebugEnabled } from "@/lib/recruiting/resume-extract-debug";
import {
  bundledEngTrainedDataExists,
  canRunResumePdfOcr,
  getBundledTesseractEngLangDir,
} from "@/lib/recruiting/recruiting-ocr-env";
import { getNodeCanvasRuntime } from "@/lib/recruiting/napi-canvas-runtime";

/**
 * OCR for image-based PDFs (no text layer). Server-only: pdf.js + node canvas + tesseract.
 * Language + WASM load from node_modules only (no runtime downloads).
 */

const DEFAULT_MAX_OCR_PAGES = 5;
const MAX_CANVAS_EDGE = 2400;
const RENDER_SCALE = 2;

export type PdfOcrPageDebug = {
  pageIndex: number;
  canvasWidth: number;
  canvasHeight: number;
  renderScale: number;
  /** Fraction of sampled pixels that are not white/near-white (0–1). */
  nonWhiteSampleRatio: number;
  /** True when render promise rejected or canvas looks blank. */
  renderLikelyFailed: boolean;
  ocrRawTextLen: number;
  /** Dev / RECRUITING_RESUME_PARSE_DEBUG only */
  ocrPreview300?: string;
};

export type PdfOcrDebug = {
  filename?: string;
  mimeType?: string;
  langDir: string | null;
  engDataOnDisk: boolean;
  canvasImportOk: boolean;
  canvasImportError?: string;
  pdfWorkerConfigured: boolean;
  pdfNumPages: number;
  pagesRendered: number;
  workerInitOk: boolean;
  workerInitError?: string;
  pages: PdfOcrPageDebug[];
  combinedOcrTextLen: number;
  /** Top-level catch message (worker/render/pdf load) */
  fatalError?: string;
};

export type PdfOcrResult = {
  text: string;
  /** Set when OCR could not run; does not imply upload failure */
  error?: string;
  debug?: PdfOcrDebug;
};

export type OcrPdfOptions = {
  /** Original filename for logs only */
  filename?: string;
  mimeType?: string;
  maxPages?: number;
  /** Collect `debug` and verbose logs (also when `isResumeExtractDebugEnabled()`). */
  forceDebug?: boolean;
};

let workerSrcSet = false;

async function ensurePdfWorker(): Promise<void> {
  if (workerSrcSet) return;
  const require = createRequire(import.meta.url);
  const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const workerPath = path.join(pdfRoot, "legacy", "build", "pdf.worker.mjs");
  const { GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  workerSrcSet = true;
}

/** Sample grid to detect blank / white canvases after PDF render. */
function sampleCanvasNonWhiteRatio(canvas: { width: number; height: number; getContext: (id: "2d") => unknown }): number {
  const ctx = canvas.getContext("2d") as {
    getImageData: (sx: number, sy: number, sw: number, sh: number) => ImageData;
  } | null;
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

/** Verbose console logs + OCR text previews (dev / RECRUITING_RESUME_PARSE_DEBUG / forceDebug). */
function wantVerboseOcrLogs(opts?: OcrPdfOptions): boolean {
  return Boolean(opts?.forceDebug) || isResumeExtractDebugEnabled();
}

/**
 * Render up to `maxPages` and run Tesseract on each page. Returns concatenated text.
 * If OCR is disabled or dependencies are missing, returns empty text without throwing.
 */
export async function ocrPdfBuffer(buffer: Buffer, options?: OcrPdfOptions): Promise<PdfOcrResult> {
  const debug: PdfOcrDebug = {
    filename: options?.filename,
    mimeType: options?.mimeType,
    langDir: null,
    engDataOnDisk: bundledEngTrainedDataExists(),
    canvasImportOk: false,
    pdfWorkerConfigured: workerSrcSet,
    pdfNumPages: 0,
    pagesRendered: 0,
    workerInitOk: false,
    pages: [],
    combinedOcrTextLen: 0,
  };

  const log = (...args: unknown[]) => {
    if (wantVerboseOcrLogs(options)) console.log("[resume pdf ocr]", ...args);
  };

  if (!canRunResumePdfOcr()) {
    debug.langDir = getBundledTesseractEngLangDir();
    log("skip: canRunResumePdfOcr() false (env or missing lang data path)", { langDir: debug.langDir });
    return { text: "", debug: { ...debug, fatalError: "OCR disabled or lang dir unavailable" } };
  }

  const langDir = getBundledTesseractEngLangDir();
  debug.langDir = langDir;
  if (!langDir) {
    log("skip: getBundledTesseractEngLangDir null");
    return { text: "", error: "Bundled OCR language data is not available.", debug };
  }

  await ensurePdfWorker();
  debug.pdfWorkerConfigured = true;

  /**
   * pdf.js 5.x Node path expects `@napi-rs/canvas` (same as pdf.js NodeCanvasFactory).
   * Loaded via CommonJS `require` in {@link getNodeCanvasRuntime} so Turbopack does not bundle native bindings.
   */
  const napiCanvas = getNodeCanvasRuntime();
  if (!napiCanvas) {
    const msg = "native canvas runtime unavailable (@napi-rs/canvas)";
    debug.canvasImportOk = false;
    debug.canvasImportError = msg;
    log("canvas runtime unavailable", msg);
    return { text: "", error: `OCR skipped (${msg})`, debug };
  }
  debug.canvasImportOk = true;
  const { createCanvas } = napiCanvas;

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createWorker, OEM } = await import("tesseract.js");

  const data = new Uint8Array(buffer.length);
  data.set(buffer);
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
  });

  let pdf: Awaited<ReturnType<typeof loadingTask.promise>> | null = null;
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  const maxPages = Math.min(options?.maxPages ?? DEFAULT_MAX_OCR_PAGES, DEFAULT_MAX_OCR_PAGES);

  try {
    pdf = await loadingTask.promise;
    debug.pdfNumPages = pdf.numPages;
    const numPages = Math.min(pdf.numPages, maxPages);
    const parts: string[] = [];

    try {
      worker = await createWorker("eng", OEM.LSTM_ONLY, {
        langPath: langDir,
        gzip: true,
        cacheMethod: "none",
      });
      debug.workerInitOk = true;
      log("tesseract worker ready", { langDir, engGz: debug.engDataOnDisk });
    } catch (we) {
      debug.workerInitOk = false;
      debug.workerInitError = we instanceof Error ? we.message : String(we);
      log("tesseract createWorker failed", debug.workerInitError);
      throw we;
    }

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      let scale = RENDER_SCALE;
      const w0 = baseViewport.width * scale;
      const h0 = baseViewport.height * scale;
      const maxEdge = Math.max(w0, h0);
      if (maxEdge > MAX_CANVAS_EDGE) {
        scale *= MAX_CANVAS_EDGE / maxEdge;
      }
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const pageDebug: PdfOcrPageDebug = {
        pageIndex: i,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        renderScale: scale,
        nonWhiteSampleRatio: 0,
        renderLikelyFailed: false,
        ocrRawTextLen: 0,
      };
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        pageDebug.renderLikelyFailed = true;
        pageDebug.ocrPreview300 = "[render error: no 2d context]";
        log(`page ${i} getContext('2d') returned null`);
        debug.pages.push(pageDebug);
        continue;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      try {
        await page
          .render({
            canvas: canvas as unknown as HTMLCanvasElement,
            viewport,
          })
          .promise;
      } catch (re) {
        pageDebug.renderLikelyFailed = true;
        const rmsg = re instanceof Error ? re.message : String(re);
        pageDebug.ocrPreview300 = `[render error: ${rmsg}]`;
        log(`page ${i} pdf.js render() failed`, rmsg);
        debug.pages.push(pageDebug);
        continue;
      }

      pageDebug.nonWhiteSampleRatio = sampleCanvasNonWhiteRatio(canvas);
      if (pageDebug.nonWhiteSampleRatio < 0.0005 && canvas.width > 20 && canvas.height > 20) {
        pageDebug.renderLikelyFailed = true;
        log(`page ${i} canvas likely blank`, {
          w: pageDebug.canvasWidth,
          h: pageDebug.canvasHeight,
          nonWhiteSampleRatio: pageDebug.nonWhiteSampleRatio,
        });
      }

      const png = Buffer.from(canvas.toBuffer("image/png"));
      let pageText = "";
      try {
        const {
          data: { text: recognized },
        } = await worker.recognize(png);
        pageText = (recognized ?? "").trim();
      } catch (oe) {
        const om = oe instanceof Error ? oe.message : String(oe);
        log(`page ${i} tesseract recognize() failed`, om);
        pageDebug.renderLikelyFailed = true;
        pageDebug.ocrPreview300 = `[ocr error: ${om}]`;
        debug.pages.push(pageDebug);
        continue;
      }

      pageDebug.ocrRawTextLen = pageText.length;
      if (
        wantVerboseOcrLogs(options) &&
        (process.env.NODE_ENV === "development" || process.env.RECRUITING_RESUME_PARSE_DEBUG === "1")
      ) {
        pageDebug.ocrPreview300 = pageText.slice(0, 300);
      }

      log(`page ${i}`, {
        canvasW: pageDebug.canvasWidth,
        canvasH: pageDebug.canvasHeight,
        nonWhiteSampleRatio: Number(pageDebug.nonWhiteSampleRatio.toFixed(4)),
        ocrRawTextLen: pageDebug.ocrRawTextLen,
        preview300: pageDebug.ocrPreview300?.slice(0, 120),
      });

      debug.pages.push(pageDebug);
      debug.pagesRendered += 1;
      if (pageText) {
        parts.push(pageText);
      }
    }

    const combined = parts.join("\n\n").trim();
    debug.combinedOcrTextLen = combined.length;
    log("done", {
      pagesRendered: debug.pagesRendered,
      combinedOcrTextLen: debug.combinedOcrTextLen,
    });
    return { text: combined, debug };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OCR failed";
    debug.fatalError = msg;
    console.error("[resume pdf ocr] fatal", { msg, stack: e instanceof Error ? e.stack : undefined });
    log("fatal", msg);
    return { text: "", error: msg, debug };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (te) {
        console.warn("[resume pdf ocr] worker terminate", te instanceof Error ? te.message : te);
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

/** Page 1 only — for sanity / debug helpers. */
export async function ocrPdfBufferFirstPage(buffer: Buffer, options?: Omit<OcrPdfOptions, "maxPages">): Promise<PdfOcrResult> {
  return ocrPdfBuffer(buffer, { ...options, maxPages: 1 });
}
