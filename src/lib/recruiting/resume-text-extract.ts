import "server-only";

import { createRequire } from "module";

import { PDFParse } from "pdf-parse";

/**
 * Extract plain text from resume buffers (PDF, DOCX, DOC) for parsing.
 */

const MAX_EXTRACT_CHARS = 120_000;

export type ExtractResult = {
  text: string;
  error?: string;
};

export async function extractResumeText(buffer: Buffer, filename: string): Promise<ExtractResult> {
  const lower = filename.toLowerCase();

  try {
    if (lower.endsWith(".pdf")) {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const text = (result.text ?? "").trim();
        return { text: text.slice(0, MAX_EXTRACT_CHARS) };
      } finally {
        await parser.destroy();
      }
    }

    if (lower.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value ?? "").trim();
      return { text: text.slice(0, MAX_EXTRACT_CHARS) };
    }

    if (lower.endsWith(".doc")) {
      const require = createRequire(import.meta.url);
      const WordExtractor = require("word-extractor") as new () => {
        extract: (src: Buffer) => Promise<{ getBody: () => string }>;
      };
      const extractor = new WordExtractor();
      const extracted = await extractor.extract(buffer);
      const text = (extracted.getBody() ?? "").trim();
      return { text: text.slice(0, MAX_EXTRACT_CHARS) };
    }

    return { text: "", error: "Unsupported file type" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Extraction failed";
    return { text: "", error: msg };
  }
}
