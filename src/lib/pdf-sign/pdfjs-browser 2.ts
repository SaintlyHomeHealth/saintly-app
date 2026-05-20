"use client";

/**
 * Browser-side PDF.js loader for the template field editor and signing previews.
 */

const PDFJS_VERSION = "5.4.296";
/** Same-origin worker (see `public/pdf.worker.min.mjs`). */
const WORKER_SRC = "/pdf.worker.min.mjs";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJsModule> | null = null;

export async function loadPdfJs(): Promise<PdfJsModule> {
  if (typeof window === "undefined") {
    throw new Error("loadPdfJs() may only be called in the browser.");
  }
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
      try {
        mod.GlobalWorkerOptions.workerSrc = WORKER_SRC;
      } catch {
        /* noop */
      }
      return mod;
    })();
  }
  return pdfjsPromise;
}

export type RenderedPdfPage = {
  index: number;
  width: number;
  height: number;
  renderToCanvas(canvas: HTMLCanvasElement, displayWidth: number): Promise<{
    pixelWidth: number;
    pixelHeight: number;
    scale: number;
  }>;
  destroy(): void;
};

export async function loadPdfFromUrl(url: string): Promise<{
  pages: RenderedPdfPage[];
  destroy: () => Promise<void>;
}> {
  const mod = await loadPdfJs();
  const loadingTask = mod.getDocument({ url, isEvalSupported: false });
  const doc = await loadingTask.promise;
  const pages: RenderedPdfPage[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const pdfPage = await doc.getPage(i + 1);
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    pages.push({
      index: i,
      width: baseViewport.width,
      height: baseViewport.height,
      async renderToCanvas(canvas, displayWidth) {
        const scale = displayWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({ scale });
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Canvas 2D context unavailable.");
        }
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.width, viewport.height);
        await pdfPage.render({
          canvas,
          viewport,
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
        }).promise;
        return {
          pixelWidth: viewport.width,
          pixelHeight: viewport.height,
          scale,
        };
      },
      destroy() {
        try {
          pdfPage.cleanup();
        } catch {
          /* noop */
        }
      },
    });
  }
  return {
    pages,
    destroy: async () => {
      for (const p of pages) p.destroy();
      try {
        await doc.destroy();
      } catch {
        /* noop */
      }
    },
  };
}
