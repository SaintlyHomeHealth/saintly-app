import "server-only";

import { createRequire } from "node:module";

/**
 * Minimal canvas surface used by resume PDF OCR (pdf.js render + PNG for Tesseract).
 * Intentionally does not reference `@napi-rs/canvas` types so bundlers do not pull native bindings into ESM graphs.
 */
export type NapiCanvasSurface = {
  width: number;
  height: number;
  getContext: (type: "2d") => {
    fillStyle: string;
    fillRect: (x: number, y: number, w: number, h: number) => void;
  } | null;
  toBuffer: (mime: "image/png") => Buffer;
};

export type NapiCanvasRuntime = {
  createCanvas: (width: number, height: number) => NapiCanvasSurface;
};

let cached: NapiCanvasRuntime | null | undefined;

/**
 * Loads `@napi-rs/canvas` only on the Node server at call time via CommonJS `require`.
 * Avoids static/dynamic `import("@napi-rs/canvas")` in modules Turbopack would place in ESM chunks.
 */
export function getNodeCanvasRuntime(): NapiCanvasRuntime | null {
  if (cached !== undefined) return cached;
  if (typeof process === "undefined" || !process.versions?.node) {
    cached = null;
    return null;
  }
  try {
    const require = createRequire(import.meta.url);
    const mod = require("@napi-rs/canvas") as { createCanvas?: unknown };
    if (typeof mod?.createCanvas !== "function") {
      cached = null;
      return null;
    }
    cached = { createCanvas: mod.createCanvas as NapiCanvasRuntime["createCanvas"] };
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
