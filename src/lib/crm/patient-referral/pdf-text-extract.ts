import "server-only";
// Must run before pdf-parse / pdfjs-dist load: polyfills Promise.withResolvers
// for Node < 22 so PDF text extraction works on older deployed runtimes.
import "./ensure-promise-with-resolvers";

import { PDFParse } from "pdf-parse";

const MAX_EXTRACT_CHARS = 120_000;
const MIN_USEFUL_TEXT = 200;

export type PatientReferralPdfExtractResult = {
  text: string;
  method: "pdf_parse" | "unpdf" | "none";
  error?: string;
  /** Per-engine diagnostics so the live route can report exactly which engine failed. */
  pdfParseTextLength: number;
  unpdfTextLength: number;
  pdfParseError?: string;
  unpdfError?: string;
  /** True when a failure is a missing dependency/worker (e.g. pdf.worker.mjs), not empty content. */
  dependencyError: boolean;
};

function errorDetail(e: unknown, fallback: string): string {
  if (e instanceof Error) {
    return e.stack ? `${e.message}\n${e.stack.split("\n").slice(1, 4).join("\n")}` : e.message;
  }
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return fallback;
  }
}

/** A worker/module-missing failure (the Vercel `pdf.worker.mjs` issue), not an empty PDF. */
function isDependencyError(msg: string | undefined): boolean {
  if (!msg) return false;
  return /pdf\.worker|cannot find module|worker|MODULE_NOT_FOUND|failed to load/i.test(msg);
}

/**
 * Worker-free text extraction via unpdf's serverless pdfjs build. We reconstruct
 * line breaks from `hasEOL` so the Tango parser (which is newline-aware) keeps
 * working. unpdf does NOT require pdf.worker.mjs, so it survives on Vercel even
 * when pdf-parse's worker is missing.
 */
async function extractPdfTextWithUnpdf(buffer: Buffer): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const parts: string[] = [];

  try {
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent();
      const items = (textContent.items ?? []) as Array<{ str?: string; hasEOL?: boolean }>;
      let line = "";
      for (const item of items) {
        const chunk = (item.str ?? "").trim();
        if (!chunk) {
          if (item.hasEOL && line) {
            parts.push(line);
            line = "";
          }
          continue;
        }
        line += (line ? " " : "") + chunk;
        if (item.hasEOL) {
          if (line) parts.push(line);
          line = "";
        }
      }
      if (line) parts.push(line);
    }
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* noop */
    }
  }

  return parts.join("\n").trim();
}

/**
 * Extract plain text from a referral PDF buffer.
 * 1) pdf-parse (layout-aware, best quality for the Tango parser).
 * 2) unpdf (worker-free fallback) — used when pdf-parse yields too little or
 *    fails because its pdfjs worker module is missing in the deployed lambda.
 */
export async function extractPatientReferralPdfText(buffer: Buffer): Promise<PatientReferralPdfExtractResult> {
  let best = "";
  let method: PatientReferralPdfExtractResult["method"] = "none";
  let error: string | undefined;
  let pdfParseTextLength = 0;
  let unpdfTextLength = 0;
  let pdfParseError: string | undefined;
  let unpdfError: string | undefined;

  try {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = (result.text ?? "").trim();
      pdfParseTextLength = text.length;
      if (text.length > best.length) {
        best = text;
        method = "pdf_parse";
      }
    } finally {
      await parser.destroy();
    }
  } catch (e) {
    pdfParseError = errorDetail(e, "pdf-parse failed");
    error = pdfParseError;
  }

  if (best.length < MIN_USEFUL_TEXT) {
    try {
      const unpdfText = await extractPdfTextWithUnpdf(buffer);
      unpdfTextLength = unpdfText.length;
      if (unpdfText.length > best.length) {
        best = unpdfText;
        method = "unpdf";
      }
    } catch (e) {
      unpdfError = errorDetail(e, "unpdf failed");
      if (!error) error = unpdfError;
    }
  }

  // Dependency failure = both engines errored and at least one was a worker/module problem,
  // and we recovered no usable text. This is NOT an "empty PDF".
  const dependencyError =
    best.length === 0 && (isDependencyError(pdfParseError) || isDependencyError(unpdfError));

  return {
    text: best.slice(0, MAX_EXTRACT_CHARS),
    method,
    error,
    pdfParseTextLength,
    unpdfTextLength,
    pdfParseError,
    unpdfError,
    dependencyError,
  };
}
