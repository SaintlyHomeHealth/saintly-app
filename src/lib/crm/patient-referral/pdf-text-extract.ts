import "server-only";
// Must run before pdf-parse / pdfjs-dist load: polyfills Promise.withResolvers
// for Node < 22 so PDF text extraction works on older deployed runtimes.
import "./ensure-promise-with-resolvers";

import { PDFParse } from "pdf-parse";

const MAX_EXTRACT_CHARS = 120_000;

export type PatientReferralPdfExtractResult = {
  text: string;
  method: "pdf_parse" | "pdfjs" | "none";
  error?: string;
  /** Per-engine diagnostics so the live route can report exactly which engine failed. */
  pdfParseTextLength: number;
  pdfjsTextLength: number;
  pdfParseError?: string;
  pdfjsError?: string;
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

async function extractPdfTextWithPdfJs(buffer: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(buffer.length);
  data.set(buffer);

  const loadingTask = getDocument({
    data,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const parts: string[] = [];

  try {
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent({ includeMarkedContent: false });
      const items = (textContent.items ?? []) as Array<{ str?: string; hasEOL?: boolean }>;
      let line = "";
      for (const item of items) {
        const chunk = (item.str ?? "").trim();
        if (!chunk) continue;
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

/** Extract plain text from a referral PDF buffer (pdf-parse, then pdfjs fallback). */
export async function extractPatientReferralPdfText(buffer: Buffer): Promise<PatientReferralPdfExtractResult> {
  let best = "";
  let method: PatientReferralPdfExtractResult["method"] = "none";
  let error: string | undefined;
  let pdfParseTextLength = 0;
  let pdfjsTextLength = 0;
  let pdfParseError: string | undefined;
  let pdfjsError: string | undefined;

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

  if (best.length < 200) {
    try {
      const pdfjsText = await extractPdfTextWithPdfJs(buffer);
      pdfjsTextLength = pdfjsText.length;
      if (pdfjsText.length > best.length) {
        best = pdfjsText;
        method = "pdfjs";
      }
    } catch (e) {
      pdfjsError = errorDetail(e, "pdfjs failed");
      if (!error) error = pdfjsError;
    }
  }

  return {
    text: best.slice(0, MAX_EXTRACT_CHARS),
    method,
    error,
    pdfParseTextLength,
    pdfjsTextLength,
    pdfParseError,
    pdfjsError,
  };
}
