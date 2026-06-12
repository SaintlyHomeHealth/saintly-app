import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

import { SAINTLY_ORGANIZATION_NAME } from "@/lib/fax/cover-sheet-constants";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const FOOTER_Y = 36;
const CONTENT_TOP = PAGE_H - MARGIN;
const CONTENT_BOTTOM = FOOTER_Y + 28;
const LINE_HEIGHT = 14;
const BODY_SIZE = 11;

const INK = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.38, 0.4, 0.44);
const RULE = rgb(0.82, 0.84, 0.86);

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const trimmed = text.trimEnd();
  if (!trimmed) return [""];

  const words = trimmed.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) rows.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const attempt = chunk + ch;
      if (font.widthOfTextAtSize(attempt, size) <= maxWidth) chunk = attempt;
      else {
        if (chunk) rows.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) rows.push(current);
  return rows.length ? rows : [""];
}

function splitBodyLines(bodyText: string): string[] {
  return bodyText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function drawFooter(page: PDFPage, font: PDFFont, pageNumber: number) {
  page.drawLine({
    start: { x: MARGIN, y: FOOTER_Y + 14 },
    end: { x: PAGE_W - MARGIN, y: FOOTER_Y + 14 },
    thickness: 0.75,
    color: RULE,
  });
  page.drawText(SAINTLY_ORGANIZATION_NAME, {
    x: MARGIN,
    y: FOOTER_Y,
    size: 7.5,
    font,
    color: MUTED,
  });
  const right = `Page ${pageNumber}`;
  const rightW = font.widthOfTextAtSize(right, 8);
  page.drawText(right, {
    x: PAGE_W - MARGIN - rightW,
    y: FOOTER_Y,
    size: 8,
    font,
    color: MUTED,
  });
}

/** Render plain document text as a multi-page PDF, preserving line breaks. */
export async function generateFaxDocumentBodyPdf(
  bodyText: string,
  title?: string
): Promise<Uint8Array> {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    throw new Error("Document body text is empty.");
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_W - MARGIN * 2;

  const renderedLines: string[] = [];
  if (title?.trim()) {
    renderedLines.push(`__TITLE__:${title.trim()}`);
    renderedLines.push("");
  }

  for (const rawLine of splitBodyLines(trimmed)) {
    if (!rawLine.trim()) {
      renderedLines.push("");
      continue;
    }
    renderedLines.push(...wrapLine(rawLine, font, BODY_SIZE, maxWidth));
  }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = CONTENT_TOP;
  let pageNumber = 1;

  const ensureSpace = (linesNeeded: number) => {
    if (y - linesNeeded * LINE_HEIGHT >= CONTENT_BOTTOM) return;
    drawFooter(page, font, pageNumber);
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageNumber += 1;
    y = CONTENT_TOP;
  };

  for (const line of renderedLines) {
    if (line.startsWith("__TITLE__:")) {
      const titleText = line.slice("__TITLE__:".length);
      ensureSpace(2);
      page.drawText(titleText, {
        x: MARGIN,
        y,
        size: 13,
        font: fontBold,
        color: INK,
      });
      y -= LINE_HEIGHT + 4;
      continue;
    }

    ensureSpace(1);
    if (line) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font,
        color: INK,
      });
    }
    y -= LINE_HEIGHT;
  }

  drawFooter(page, font, pageNumber);
  return doc.save();
}
