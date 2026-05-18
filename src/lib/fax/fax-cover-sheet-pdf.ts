import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

import {
  FAX_HIPAA_CONFIDENTIALITY_NOTICE,
  SAINTLY_ORGANIZATION_NAME,
  SAINTLY_RETURN_FAX_DISPLAY,
} from "@/lib/fax/cover-sheet-constants";
import type { FaxCoverSheetFields } from "@/lib/fax/fax-cover-template-types";
import { formatDateOfBirthDisplay } from "@/lib/fax/format-date-of-birth-input";
import { formatPhoneFaxInput } from "@/lib/fax/format-fax-phone-display";
import { loadSaintlyLogoForPdf } from "@/lib/fax/load-saintly-logo-pdf";

const MARGIN = 54;
const PAGE_W = 612;
const PAGE_H = 792;

const INK = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.38, 0.4, 0.44);
const RULE = rgb(0.82, 0.84, 0.86);
const ACCENT = rgb(0.08, 0.42, 0.52);

function wrapText(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxLen) {
      cur = next;
      continue;
    }
    if (cur) rows.push(cur);
    if (w.length <= maxLen) cur = w;
    else {
      for (let i = 0; i < w.length; i += maxLen) rows.push(w.slice(i, i + maxLen));
      cur = "";
    }
  }
  if (cur) rows.push(cur);
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

function drawLabelValue(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  x: number,
  y: number,
  label: string,
  value: string
): number {
  page.drawText(label.toUpperCase(), { x, y, size: 8, font: fontBold, color: MUTED });
  const lines = wrapText(value, 42);
  let cy = y - 12;
  for (const line of lines) {
    page.drawText(line, { x, y: cy, size: 11, font, color: INK });
    cy -= 14;
  }
  return cy - 4;
}

function drawBlockTitle(page: PDFPage, fontBold: PDFFont, x: number, y: number, title: string) {
  page.drawText(title.toUpperCase(), { x, y, size: 9, font: fontBold, color: ACCENT });
}

/** Generate a one-page fax cover sheet PDF (fax-friendly: light rules, no heavy fills). */
export async function generateFaxCoverSheetPdf(
  fields: FaxCoverSheetFields,
  templateTitle?: string
): Promise<Uint8Array> {
  const coverDoc = await PDFDocument.create();
  const page = coverDoc.addPage([PAGE_W, PAGE_H]);
  const font = await coverDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await coverDoc.embedFont(StandardFonts.HelveticaBold);

  const logoAsset = await loadSaintlyLogoForPdf();
  let headerBottom = PAGE_H - MARGIN;

  let headerTextX = MARGIN;
  if (logoAsset) {
    try {
      const logo =
        logoAsset.kind === "jpeg"
          ? await coverDoc.embedJpg(logoAsset.bytes)
          : await coverDoc.embedPng(logoAsset.bytes);
      const logoH = 52;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, {
        x: MARGIN,
        y: PAGE_H - MARGIN - logoH,
        width: logoW,
        height: logoH,
      });
      headerTextX = MARGIN + logoW + 14;
    } catch {
      /* logo optional — text header remains */
    }
  }
  page.drawText(SAINTLY_ORGANIZATION_NAME, {
    x: headerTextX,
    y: PAGE_H - MARGIN - 18,
    size: 16,
    font: fontBold,
    color: INK,
  });
  page.drawText("FAX COVER SHEET", {
    x: headerTextX,
    y: PAGE_H - MARGIN - 34,
    size: 10,
    font: fontBold,
    color: ACCENT,
  });
  page.drawText(`Return fax: ${SAINTLY_RETURN_FAX_DISPLAY}`, {
    x: headerTextX,
    y: PAGE_H - MARGIN - 48,
    size: 10,
    font,
    color: MUTED,
  });

  headerBottom = PAGE_H - MARGIN - 58;
  drawRule(page, headerBottom);
  let y = headerBottom - 22;

  const colMid = PAGE_W / 2 + 8;
  const colRight = PAGE_W - MARGIN;
  const colLeftW = colMid - MARGIN - 12;

  drawBlockTitle(page, fontBold, MARGIN, y, "To");
  drawBlockTitle(page, fontBold, colMid, y, "From");
  y -= 14;

  const toName =
    [fields.recipientName?.trim(), fields.recipientOrganization?.trim()].filter(Boolean).join(" · ") || "—";
  let leftY = drawLabelValue(page, font, fontBold, MARGIN, y, "Recipient", toName);
  if (fields.recipientPhone?.trim()) {
    leftY = drawLabelValue(
      page,
      font,
      fontBold,
      MARGIN,
      leftY,
      "Phone",
      formatPhoneFaxInput(fields.recipientPhone)
    );
  }
  if (fields.recipientFax?.trim()) {
    leftY = drawLabelValue(
      page,
      font,
      fontBold,
      MARGIN,
      leftY,
      "Fax",
      formatPhoneFaxInput(fields.recipientFax)
    );
  }

  let rightY = drawLabelValue(page, font, fontBold, colMid, y, "Organization", SAINTLY_ORGANIZATION_NAME);
  rightY = drawLabelValue(page, font, fontBold, colMid, rightY, "Return fax", SAINTLY_RETURN_FAX_DISPLAY);

  y = Math.min(leftY, rightY) - 8;
  drawRule(page, y);
  y -= 20;

  drawBlockTitle(page, fontBold, MARGIN, y, "Patient");
  drawBlockTitle(page, fontBold, colMid, y, "Transmission details");
  y -= 14;

  leftY = drawLabelValue(
    page,
    font,
    fontBold,
    MARGIN,
    y,
    "Name",
    fields.patientName?.trim() || "—"
  );
  if (fields.patientDob?.trim()) {
    leftY = drawLabelValue(
      page,
      font,
      fontBold,
      MARGIN,
      leftY,
      "Date of birth",
      formatDateOfBirthDisplay(fields.patientDob)
    );
  }

  rightY = drawLabelValue(page, font, fontBold, colMid, y, "Date", fields.date?.trim() || "—");
  rightY = drawLabelValue(page, font, fontBold, colMid, rightY, "Total pages", fields.totalPages?.trim() || "—");

  y = Math.min(leftY, rightY) - 8;
  drawRule(page, y);
  y -= 20;

  const subject = fields.subject?.trim() || templateTitle?.trim() || "—";
  y = drawLabelValue(page, font, fontBold, MARGIN, y, "Subject", subject);
  y -= 6;

  if (fields.message?.trim()) {
    page.drawText("MESSAGE", { x: MARGIN, y, size: 8, font: fontBold, color: MUTED });
    y -= 12;
    for (const row of fields.message.trim().split(/\r?\n/)) {
      for (const line of wrapText(row, 88)) {
        if (y < 120) break;
        page.drawText(line, { x: MARGIN, y, size: 11, font, color: INK });
        y -= 14;
      }
    }
  }

  const hipaaY = 72;
  drawRule(page, hipaaY + 14);
  const hipaaLines = wrapText(FAX_HIPAA_CONFIDENTIALITY_NOTICE, 96);
  let hy = hipaaY;
  for (const line of hipaaLines) {
    page.drawText(line, { x: MARGIN, y: hy, size: 7.5, font, color: MUTED });
    hy -= 9;
    if (hy < 36) break;
  }

  return coverDoc.save();
}
