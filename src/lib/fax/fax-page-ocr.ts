import "server-only";

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canRunResumePdfOcr, getBundledTesseractEngLangDir } from "@/lib/recruiting/recruiting-ocr-env";
import { getNodeCanvasRuntime } from "@/lib/recruiting/napi-canvas-runtime";

let workerSrcSet = false;

async function ensurePdfWorker(): Promise<void> {
  const require = createRequire(import.meta.url);
  const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const workerPath = path.join(pdfRoot, "legacy", "build", "pdf.worker.mjs");
  // unpdf may have already installed a different pdf.js worker on globalThis.
  // Drop it so this 5.4.296 API does not talk to a 5.6.x worker.
  try {
    delete (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker;
  } catch {
    /* noop */
  }
  const { GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  workerSrcSet = true;
}

const MAX_CANVAS_EDGE = 2200;
const RENDER_SCALE = 2;
const MAX_OCR_PAGES = 8;
const VISION_PAGE_LIMIT = 4;

export type FaxPageOcrMap = Map<number, string>;

async function renderPdfPagePng(
  buffer: Buffer,
  pageNumber: number
): Promise<Buffer | null> {
  const napiCanvas = getNodeCanvasRuntime();
  if (!napiCanvas) return null;
  const { createCanvas } = napiCanvas;
  await ensurePdfWorker();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(buffer.length);
  data.set(buffer);
  const loadingTask = getDocument({ data, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  try {
    if (pageNumber < 1 || pageNumber > pdf.numPages) return null;
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    let scale = RENDER_SCALE;
    const maxEdge = Math.max(baseViewport.width, baseViewport.height) * scale;
    if (maxEdge > MAX_CANVAS_EDGE) scale *= MAX_CANVAS_EDGE / maxEdge;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise;
    return Buffer.from(canvas.toBuffer("image/png"));
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* noop */
    }
  }
}

async function tesseractOcrPng(png: Buffer): Promise<string> {
  if (!canRunResumePdfOcr()) return "";
  const langDir = getBundledTesseractEngLangDir();
  if (!langDir) return "";
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath: langDir,
    gzip: true,
    cacheMethod: "none",
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(png);
    return (text ?? "").trim();
  } finally {
    try {
      await worker.terminate();
    } catch {
      /* noop */
    }
  }
}

async function visionOcrPng(png: Buffer): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return "";
  const model = process.env.SAINTLY_FAX_OCR_VISION_MODEL?.trim() || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe every readable word on this fax page as plain text. Preserve labels like Patient Name and DOB. Return text only.",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    console.warn("[fax/ocr] vision_http", { status: res.status });
    return "";
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

/**
 * OCR specific 1-based page numbers. Prefers local Tesseract; falls back to a
 * vision model when Tesseract is unavailable or returns almost nothing.
 * Logs page lengths only — never transcribed text.
 */
export async function ocrSelectedFaxPages(
  buffer: Buffer,
  pageNumbers: number[],
  options?: { faxId?: string }
): Promise<FaxPageOcrMap> {
  const unique = [...new Set(pageNumbers.filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_OCR_PAGES);
  const out: FaxPageOcrMap = new Map();
  if (unique.length === 0) return out;

  let visionUsed = 0;
  for (const page of unique) {
    try {
      const png = await renderPdfPagePng(buffer, page);
      if (!png) {
        console.warn("[fax/ocr] render_failed", { fax_id: options?.faxId ?? null, page });
        continue;
      }

      let text = "";
      let method = "none";
      try {
        text = await tesseractOcrPng(png);
        if (text) method = "tesseract";
      } catch (e) {
        console.warn("[fax/ocr] tesseract_failed", {
          fax_id: options?.faxId ?? null,
          page,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      if (text.length < 50 && visionUsed < VISION_PAGE_LIMIT) {
        const vision = await visionOcrPng(png);
        if (vision.length > text.length) {
          text = vision;
          method = "vision";
          visionUsed += 1;
        }
      }

      if (text) out.set(page, text);
      console.log("[fax/ocr] page_done", {
        fax_id: options?.faxId ?? null,
        page,
        chars: text.length,
        method,
      });
    } catch (e) {
      console.warn("[fax/ocr] page_failed", {
        fax_id: options?.faxId ?? null,
        page,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return out;
}
