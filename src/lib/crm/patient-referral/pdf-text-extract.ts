import "server-only";

import { PDFParse } from "pdf-parse";

const MAX_EXTRACT_CHARS = 120_000;

export type PatientReferralPdfExtractResult = {
  text: string;
  method: "pdf_parse" | "pdfjs" | "none";
  error?: string;
};

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

  try {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = (result.text ?? "").trim();
      if (text.length > best.length) {
        best = text;
        method = "pdf_parse";
      }
    } finally {
      await parser.destroy();
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "pdf-parse failed";
  }

  if (best.length < 200) {
    try {
      const pdfjsText = await extractPdfTextWithPdfJs(buffer);
      if (pdfjsText.length > best.length) {
        best = pdfjsText;
        method = "pdfjs";
      }
    } catch (e) {
      if (!error) error = e instanceof Error ? e.message : "pdfjs failed";
    }
  }

  return {
    text: best.slice(0, MAX_EXTRACT_CHARS),
    method,
    error,
  };
}
