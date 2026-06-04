import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

import { loadSaintlyLogoForPdf } from "@/lib/fax/load-saintly-logo-pdf";
import {
  COMPLIANCE_PROGRAM_BLOCKS,
  COMPLIANCE_PROGRAM_COVER_FIELDS,
  COMPLIANCE_PROGRAM_EFFECTIVE_DATE,
  COMPLIANCE_PROGRAM_SOURCE_URL,
  type ComplianceProgramBlock,
} from "@/lib/marketing/compliance-program-content-data";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const FOOTER_Y = 36;
const CONTENT_TOP = PAGE_H - MARGIN;
const CONTENT_BOTTOM = FOOTER_Y + 28;

const INK = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.38, 0.4, 0.44);
const RULE = rgb(0.82, 0.84, 0.86);
const ACCENT = rgb(0.08, 0.42, 0.52);

type LayoutContext = {
  doc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  page: PDFPage;
  y: number;
  pageNumber: number;
  generatedOnLabel: string;
};

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
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

function drawRule(page: PDFPage, y: number) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: RULE,
  });
}

function drawFooter(ctx: LayoutContext) {
  const { page, font, pageNumber, generatedOnLabel } = ctx;
  drawRule(page, FOOTER_Y + 14);
  page.drawText(`Source: ${COMPLIANCE_PROGRAM_SOURCE_URL}`, {
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
  const center = `Generated ${generatedOnLabel}`;
  const centerW = font.widthOfTextAtSize(center, 7.5);
  page.drawText(center, {
    x: (PAGE_W - centerW) / 2,
    y: FOOTER_Y,
    size: 7.5,
    font,
    color: MUTED,
  });
}

function addContentPage(ctx: LayoutContext): LayoutContext {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  const pageNumber = ctx.pageNumber + 1;
  const next: LayoutContext = { ...ctx, page, y: CONTENT_TOP, pageNumber };
  drawFooter(next);
  return next;
}

function ensureSpace(ctx: LayoutContext, needed: number): LayoutContext {
  if (ctx.y - needed >= CONTENT_BOTTOM) return ctx;
  return addContentPage(ctx);
}

function drawLines(ctx: LayoutContext, lines: string[], size: number, font: PDFFont, lineHeight: number, color = INK) {
  let current = ctx;
  for (const line of lines) {
    current = ensureSpace(current, lineHeight + 4);
    current.page.drawText(line, { x: MARGIN, y: current.y, size, font, color });
    current = { ...current, y: current.y - lineHeight };
  }
  return current;
}

function drawBlock(ctx: LayoutContext, block: ComplianceProgramBlock): LayoutContext {
  const maxWidth = PAGE_W - MARGIN * 2;
  if (block.type === "h2") {
    let current = ensureSpace(ctx, 34);
    current = { ...current, y: current.y - 8 };
    current.page.drawText(block.text, {
      x: MARGIN,
      y: current.y,
      size: 13,
      font: current.fontBold,
      color: ACCENT,
    });
    current = { ...current, y: current.y - 18 };
    drawRule(current.page, current.y + 8);
    return { ...current, y: current.y - 6 };
  }
  if (block.type === "h3") {
    let current = ensureSpace(ctx, 24);
    current.page.drawText(block.text, {
      x: MARGIN,
      y: current.y,
      size: 11,
      font: current.fontBold,
      color: INK,
    });
    return { ...current, y: current.y - 16 };
  }
  if (block.type === "p") {
    const lines = wrapText(block.text, ctx.font, 10.5, maxWidth);
    let current = drawLines(ctx, lines, 10.5, ctx.font, 14);
    return { ...current, y: current.y - 4 };
  }
  let current = ctx;
  for (const item of block.items) {
    const bulletLines = wrapText(item, current.font, 10.5, maxWidth - 16);
    current = ensureSpace(current, 14 * bulletLines.length + 4);
    bulletLines.forEach((line, index) => {
      if (index === 0) {
        current.page.drawText("•", { x: MARGIN + 2, y: current.y, size: 10.5, font: current.fontBold, color: ACCENT });
      }
      current.page.drawText(line, {
        x: MARGIN + 16,
        y: current.y,
        size: 10.5,
        font: current.font,
        color: INK,
      });
      current = { ...current, y: current.y - 14 };
    });
  }
  return { ...current, y: current.y - 2 };
}

function formatGeneratedDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  }).format(date);
}

async function drawCoverPage(
  doc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  generatedOnLabel: string
): Promise<void> {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const fields = COMPLIANCE_PROGRAM_COVER_FIELDS;
  let y = PAGE_H - MARGIN;

  const logoAsset = await loadSaintlyLogoForPdf();
  if (logoAsset) {
    try {
      const logo =
        logoAsset.kind === "jpeg" ? await doc.embedJpg(logoAsset.bytes) : await doc.embedPng(logoAsset.bytes);
      const logoH = 56;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, {
        x: (PAGE_W - logoW) / 2,
        y: y - logoH,
        width: logoW,
        height: logoH,
      });
      y -= logoH + 28;
    } catch {
      /* optional logo */
    }
  }

  const titleLines = wrapText(fields.title, fontBold, 18, PAGE_W - MARGIN * 2);
  for (const line of titleLines) {
    const w = fontBold.widthOfTextAtSize(line, 18);
    page.drawText(line, {
      x: (PAGE_W - w) / 2,
      y,
      size: 18,
      font: fontBold,
      color: INK,
    });
    y -= 24;
  }

  y -= 8;
  drawRule(page, y);
  y -= 28;

  const infoRows: Array<[string, string]> = [
    ["Company", fields.companyName],
    ["Address", fields.address],
    ["Phone", fields.phone],
    ["Fax", fields.fax],
    ["Email", fields.email],
    ["Website", fields.website],
    ["NPI", fields.npi],
    ["EIN", fields.ein],
    ["Medicare PTAN/CCN", fields.medicarePtan],
    ["AHCCCS Medicaid Provider ID", fields.ahcccsProviderId],
    ["Program effective date", COMPLIANCE_PROGRAM_EFFECTIVE_DATE],
    ["Date generated", generatedOnLabel],
  ];

  for (const [label, value] of infoRows) {
    page.drawText(label.toUpperCase(), { x: MARGIN, y, size: 8, font: fontBold, color: MUTED });
    const valueLines = wrapText(value, font, 11, PAGE_W - MARGIN * 2);
    let valueY = y - 12;
    for (const line of valueLines) {
      page.drawText(line, { x: MARGIN, y: valueY, size: 11, font, color: INK });
      valueY -= 14;
    }
    y = valueY - 8;
  }

  y -= 8;
  drawRule(page, y);
  y -= 22;
  const summary =
    "This document summarizes Saintly Home Health LLC’s published Compliance Program for payer credentialing and onboarding purposes.";
  for (const line of wrapText(summary, font, 10.5, PAGE_W - MARGIN * 2)) {
    page.drawText(line, { x: MARGIN, y, size: 10.5, font, color: MUTED });
    y -= 14;
  }

  page.drawText(`Source documentation: ${COMPLIANCE_PROGRAM_SOURCE_URL}`, {
    x: MARGIN,
    y: FOOTER_Y,
    size: 7.5,
    font,
    color: MUTED,
  });
}

/** Generate a payer-ready Compliance Program Materials PDF from published website content. */
export async function generateComplianceProgramMaterialsPdf(options?: {
  generatedAt?: Date;
}): Promise<Uint8Array> {
  const generatedAt = options?.generatedAt ?? new Date();
  const generatedOnLabel = formatGeneratedDate(generatedAt);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  await drawCoverPage(doc, font, fontBold, generatedOnLabel);

  let ctx: LayoutContext = {
    doc,
    font,
    fontBold,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: CONTENT_TOP,
    pageNumber: 2,
    generatedOnLabel,
  };
  drawFooter(ctx);

  ctx.page.drawText("Compliance Program Summary", {
    x: MARGIN,
    y: ctx.y,
    size: 15,
    font: fontBold,
    color: INK,
  });
  ctx = { ...ctx, y: ctx.y - 24 };

  for (const block of COMPLIANCE_PROGRAM_BLOCKS) {
    ctx = drawBlock(ctx, block);
  }

  return doc.save();
}

export const COMPLIANCE_PROGRAM_PDF_FILENAME = "Saintly_Home_Health_Compliance_Program_Materials.pdf";
