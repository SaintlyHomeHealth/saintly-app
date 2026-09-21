import "server-only";
import "@/lib/crm/patient-referral/ensure-promise-with-resolvers";

import { ocrSelectedFaxPages } from "@/lib/fax/fax-page-ocr";

/** Fax packets can be 100+ pages; cover sheets sit on page 1 and signed orders on the tail. */
export const FAX_EXTRACT_FIRST_PAGES = 15;
export const FAX_EXTRACT_LAST_PAGES = 2;
/** Token-budget cap applied *per page* so page 2+ demographics are never sliced off. */
export const FAX_EXTRACT_PER_PAGE_CHAR_CAP = 3_500;
/** Below this, treat the page as image-only and run OCR. */
export const FAX_IMAGE_ONLY_CHAR_THRESHOLD = 50;

export type FaxPageTextMethod = "pdf_text" | "ocr" | "empty";

export type FaxPageText = {
  page: number;
  charCount: number;
  text: string;
  method: FaxPageTextMethod;
};

export type FaxDocumentTextResult = {
  pageCount: number;
  selectedPages: number[];
  pages: FaxPageText[];
  /** Model-ready payload: labeled pages with a per-page cap, not a global prefix slice. */
  modelText: string;
  totalChars: number;
  ocrPageCount: number;
};

export function selectFaxExtractPages(
  pageCount: number,
  firstN: number = FAX_EXTRACT_FIRST_PAGES,
  lastN: number = FAX_EXTRACT_LAST_PAGES
): number[] {
  const n = Math.max(0, Math.trunc(pageCount));
  if (n <= 0) return [];
  if (n <= firstN) return rangeInclusive(1, n);
  const first = rangeInclusive(1, firstN);
  const lastStart = Math.max(firstN + 1, n - lastN + 1);
  const last = rangeInclusive(lastStart, n);
  return [...first, ...last];
}

function rangeInclusive(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

function capPageText(text: string, cap: number = FAX_EXTRACT_PER_PAGE_CHAR_CAP): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= cap) return trimmed;
  return `${trimmed.slice(0, cap)}…`;
}

export function formatFaxPagesForModel(pages: FaxPageText[]): string {
  return pages
    .map((p) => {
      const body = capPageText(p.text);
      return `--- Page ${p.page} (${p.charCount} chars, ${p.method}) ---\n${body || "[no text]"}`;
    })
    .join("\n\n");
}

function logPageCharCounts(input: {
  pageCount: number;
  pages: FaxPageText[];
  faxId?: string;
}): void {
  // Scrubbed: page numbers + lengths only. Never log extracted text (PHI).
  console.log("[fax/extract] page_char_counts", {
    fax_id: input.faxId ?? null,
    page_count: input.pageCount,
    selected: input.pages.length,
    pages: input.pages.map((p) => ({ page: p.page, chars: p.charCount, method: p.method })),
    total_chars: input.pages.reduce((sum, p) => sum + p.charCount, 0),
  });
}

async function extractPageTextLayer(
  pdf: { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items?: unknown[] }> }> },
  pageIndex: number
): Promise<string> {
  const page = await pdf.getPage(pageIndex);
  const textContent = await page.getTextContent();
  const items = (textContent.items ?? []) as Array<{ str?: string; hasEOL?: boolean }>;
  const parts: string[] = [];
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
  return parts.join("\n").trim();
}

/**
 * Extract the text layer from the first N + last 2 pages, OCR any image-only page,
 * and build a model payload that keeps a page spread (never the first N characters
 * of a concatenation).
 */
export async function extractFaxDocumentText(
  buffer: Buffer,
  options?: { faxId?: string; skipOcr?: boolean }
): Promise<FaxDocumentTextResult> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pageCount = pdf.numPages;
  const selectedPages = selectFaxExtractPages(pageCount);
  const pages: FaxPageText[] = [];

  try {
    for (const pageNum of selectedPages) {
      let text = "";
      try {
        text = await extractPageTextLayer(pdf, pageNum);
      } catch (e) {
        console.warn("[fax/extract] page_text_failed", {
          fax_id: options?.faxId ?? null,
          page: pageNum,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      const charCount = text.length;
      pages.push({
        page: pageNum,
        charCount,
        text,
        method: charCount >= FAX_IMAGE_ONLY_CHAR_THRESHOLD ? "pdf_text" : charCount > 0 ? "pdf_text" : "empty",
      });
    }
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* noop */
    }
  }

  const imageOnlyPages = pages
    .filter((p) => p.charCount < FAX_IMAGE_ONLY_CHAR_THRESHOLD)
    .map((p) => p.page);

  let ocrPageCount = 0;
  if (imageOnlyPages.length > 0 && !options?.skipOcr) {
    const ocrByPage = await ocrSelectedFaxPages(buffer, imageOnlyPages, { faxId: options?.faxId });
    for (const page of pages) {
      const ocrText = ocrByPage.get(page.page)?.trim() ?? "";
      if (ocrText.length > page.charCount) {
        page.text = ocrText;
        page.charCount = ocrText.length;
        page.method = "ocr";
        ocrPageCount += 1;
      }
    }
  }

  logPageCharCounts({ pageCount, pages, faxId: options?.faxId });

  const modelText = formatFaxPagesForModel(pages);
  const totalChars = pages.reduce((sum, p) => sum + p.charCount, 0);

  return {
    pageCount,
    selectedPages,
    pages,
    modelText,
    totalChars,
    ocrPageCount,
  };
}
