import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

import { loadSaintlyLogoForPdf } from "@/lib/fax/load-saintly-logo-pdf";
import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
import {
  formatCentsUsd,
  formatPaymentDetail,
  formatQuantity,
  serviceTypeLabel,
  unitLabelNoun,
} from "@/lib/private-pay/format";
import type { PrivatePayInvoiceWithItems, PrivatePayPayment } from "@/lib/private-pay/types";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 46;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Soft blue / white medical palette with a gold halo accent.
const INK = rgb(0.12, 0.16, 0.23);
const MUTED = rgb(0.43, 0.48, 0.56);
const ACCENT = rgb(0.13, 0.42, 0.68);
const ACCENT_DEEP = rgb(0.06, 0.26, 0.44);
const CARD_FILL = rgb(0.955, 0.975, 1);
const CARD_BORDER = rgb(0.78, 0.87, 0.96);
const HEADER_FILL = rgb(0.9, 0.95, 1);
const GOLD = rgb(0.82, 0.63, 0.16);
const GOLD_SOFT = rgb(0.96, 0.86, 0.62);
const PAID_GREEN = rgb(0.05, 0.5, 0.32);
const UNPAID_RED = rgb(0.74, 0.22, 0.22);
const WHITE = rgb(1, 1, 1);

type Fonts = { font: PDFFont; bold: PDFFont };

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) rows.push(current);
      current = word;
    }
  }
  if (current) rows.push(current);
  return rows.length ? rows : [""];
}

function drawRight(page: PDFPage, text: string, rightX: number, y: number, size: number, font: PDFFont, color = INK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

function drawCenter(page: PDFPage, text: string, centerX: number, y: number, size: number, font: PDFFont, color = INK) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - w / 2, y, size, font, color });
}

/** Filled rounded rectangle approximated with rectangles + corner circles. */
function fillRound(page: PDFPage, x: number, y: number, w: number, h: number, r: number, color: RGB, opacity = 1) {
  const rad = Math.min(r, w / 2, h / 2);
  page.drawRectangle({ x: x + rad, y, width: w - 2 * rad, height: h, color, opacity });
  page.drawRectangle({ x, y: y + rad, width: w, height: h - 2 * rad, color, opacity });
  for (const [cx, cy] of [
    [x + rad, y + rad],
    [x + w - rad, y + rad],
    [x + rad, y + h - rad],
    [x + w - rad, y + h - rad],
  ] as const) {
    page.drawCircle({ x: cx, y: cy, size: rad, color, opacity });
  }
}

/** Rounded card with an optional border drawn as a slightly larger backing shape. */
function roundedCard(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  opts: { fill?: RGB; border?: RGB; borderWidth?: number } = {}
) {
  const { fill = WHITE, border, borderWidth = 1 } = opts;
  if (border) {
    fillRound(page, x, y, w, h, r, border);
    fillRound(page, x + borderWidth, y + borderWidth, w - 2 * borderWidth, h - 2 * borderWidth, Math.max(0, r - borderWidth), fill);
  } else {
    fillRound(page, x, y, w, h, r, fill);
  }
}

/** Pill/chip with label text. */
function drawChip(page: PDFPage, fonts: Fonts, label: string, x: number, y: number, fill: RGB, textColor: RGB, size = 9) {
  const padX = 9;
  const w = fonts.bold.widthOfTextAtSize(label, size) + padX * 2;
  const h = size + 9;
  fillRound(page, x, y, w, h, h / 2, fill);
  page.drawText(label, { x: x + padX, y: y + 4.5, size, font: fonts.bold, color: textColor });
  return w;
}

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Phoenix",
  }).format(d);
}

function lineDetail(item: PrivatePayInvoiceWithItems["items"][number]): string | null {
  if (item.unit_label === "flat") return "Flat rate";
  return `${formatQuantity(item.quantity)} ${unitLabelNoun(item.unit_label, item.quantity)} × ${formatCentsUsd(
    item.unit_amount_cents
  )}`;
}

async function drawHeader(
  doc: PDFDocument,
  page: PDFPage,
  fonts: Fonts,
  isReceipt: boolean
): Promise<number> {
  const cardH = 96;
  const top = PAGE_H - MARGIN;
  const cardY = top - cardH;
  roundedCard(page, MARGIN, cardY, CONTENT_W, cardH, 16, { fill: HEADER_FILL, border: CARD_BORDER });

  // Gold halo accent behind the logo.
  const haloCx = MARGIN + 58;
  const haloCy = cardY + cardH / 2;
  page.drawCircle({ x: haloCx, y: haloCy, size: 40, color: GOLD_SOFT, opacity: 0.5 });
  page.drawCircle({ x: haloCx, y: haloCy, size: 30, color: GOLD, opacity: 0.18 });

  const logoAsset = await loadSaintlyLogoForPdf();
  if (logoAsset) {
    try {
      const logo =
        logoAsset.kind === "jpeg" ? await doc.embedJpg(logoAsset.bytes) : await doc.embedPng(logoAsset.bytes);
      const logoH = 60;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: haloCx - logoW / 2, y: haloCy - logoH / 2, width: logoW, height: logoH });
    } catch {
      /* optional logo */
    }
  }

  // Title block on the right.
  const rightX = PAGE_W - MARGIN - 18;
  const title = isReceipt ? "PRIVATE PAY RECEIPT" : "PRIVATE PAY INVOICE";
  drawRight(page, title, rightX, cardY + cardH - 32, 16, fonts.bold, ACCENT_DEEP);
  drawRight(page, isReceipt ? "PAYMENT RECEIVED" : "DUE UPON RECEIPT", rightX, cardY + cardH - 50, 9, fonts.bold, isReceipt ? PAID_GREEN : ACCENT);
  drawRight(page, PRIVATE_PAY_BUSINESS.legalName, rightX, cardY + 16, 9, fonts.font, MUTED);

  // Business contact line just under the header card.
  let y = cardY - 16;
  const contact = `${PRIVATE_PAY_BUSINESS.addressFull}`;
  page.drawText(contact, { x: MARGIN + 2, y, size: 8.5, font: fonts.font, color: MUTED });
  y -= 11;
  page.drawText(`Phone ${PRIVATE_PAY_BUSINESS.phoneDisplay}  |  ${PRIVATE_PAY_BUSINESS.email}`, {
    x: MARGIN + 2,
    y,
    size: 8.5,
    font: fonts.font,
    color: MUTED,
  });
  return y - 18;
}

function drawBillToAndAmount(
  page: PDFPage,
  fonts: Fonts,
  topY: number,
  invoice: PrivatePayInvoiceWithItems,
  isReceipt: boolean,
  payment: PrivatePayPayment | null
): number {
  const gap = 16;
  const colW = (CONTENT_W - gap) / 2;
  const cardH = 116;
  const cardY = topY - cardH;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gap;

  // --- BILL TO card ---
  roundedCard(page, leftX, cardY, colW, cardH, 14, { fill: WHITE, border: CARD_BORDER });
  let ly = cardY + cardH - 22;
  const lpad = leftX + 16;
  page.drawText("BILL TO", { x: lpad, y: ly, size: 8, font: fonts.bold, color: ACCENT });
  ly -= 18;
  const name = (invoice.billing_name ?? "").trim() || "Private Pay Client";
  page.drawText(name, { x: lpad, y: ly, size: 13, font: fonts.bold, color: INK });
  ly -= 16;
  const contactLine = [invoice.billing_phone, invoice.billing_email]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join("  |  ");
  if (contactLine) {
    for (const w of wrap(contactLine, fonts.font, 9.5, colW - 32)) {
      page.drawText(w, { x: lpad, y: ly, size: 9.5, font: fonts.font, color: MUTED });
      ly -= 12;
    }
  }
  if ((invoice.billing_address ?? "").trim()) {
    for (const w of wrap(invoice.billing_address!.trim(), fonts.font, 9.5, colW - 32)) {
      page.drawText(w, { x: lpad, y: ly, size: 9.5, font: fonts.font, color: MUTED });
      ly -= 12;
    }
  }

  // --- AMOUNT card ---
  roundedCard(page, rightX, cardY, colW, cardH, 14, { fill: CARD_FILL, border: CARD_BORDER });
  let ry = cardY + cardH - 22;
  const rpad = rightX + 16;
  page.drawText(isReceipt ? "AMOUNT PAID" : "AMOUNT DUE", { x: rpad, y: ry, size: 8, font: fonts.bold, color: ACCENT });
  ry -= 30;
  const amountText = formatCentsUsd(invoice.total_cents);
  page.drawText(amountText, { x: rpad, y: ry, size: 26, font: fonts.bold, color: ACCENT_DEEP });
  // Status chip to the right of the amount.
  const chipX = rpad + fonts.bold.widthOfTextAtSize(amountText, 26) + 12;
  if (isReceipt) {
    drawChip(page, fonts, "PAID", chipX, ry + 4, rgb(0.86, 0.96, 0.9), PAID_GREEN);
  } else {
    drawChip(page, fonts, "UNPAID", chipX, ry + 4, rgb(0.99, 0.91, 0.91), UNPAID_RED);
  }
  ry -= 22;
  const note = isReceipt
    ? `Paid ${formatLongDate(payment?.paid_at ?? invoice.paid_at)} · ${formatPaymentDetail(payment)}`
    : "Secure payment link can be sent by email or text.";
  for (const w of wrap(note, fonts.font, 8.5, colW - 32)) {
    page.drawText(w, { x: rpad, y: ry, size: 8.5, font: fonts.font, color: MUTED });
    ry -= 11;
  }

  return cardY - 18;
}

function drawMetaRow(page: PDFPage, fonts: Fonts, topY: number, invoice: PrivatePayInvoiceWithItems, isReceipt: boolean, payment: PrivatePayPayment | null): number {
  const cells: Array<[string, string]> = [];
  cells.push(["INVOICE #", invoice.invoice_number]);
  if (isReceipt && payment?.receipt_number) cells.push(["RECEIPT #", payment.receipt_number]);
  cells.push([isReceipt ? "PAID DATE" : "DATE", formatLongDate(isReceipt ? payment?.paid_at ?? invoice.paid_at : invoice.created_at)]);

  const colW = CONTENT_W / cells.length;
  let x = MARGIN + 2;
  for (const [label, value] of cells) {
    page.drawText(label, { x, y: topY, size: 7.5, font: fonts.bold, color: MUTED });
    page.drawText(value, { x, y: topY - 13, size: 10.5, font: fonts.bold, color: INK });
    x += colW;
  }
  return topY - 30;
}

function drawServiceTable(page: PDFPage, fonts: Fonts, topY: number, invoice: PrivatePayInvoiceWithItems): number {
  const qtyX = PAGE_W - MARGIN - 200;
  const rateX = PAGE_W - MARGIN - 130;
  const amountRightX = PAGE_W - MARGIN - 16;
  const descX = MARGIN + 16;
  const descMaxW = qtyX - descX - 10;

  // Pre-measure rows to size the card.
  const rows = invoice.items.map((item) => {
    const title = (item.description ?? "").trim() || serviceTypeLabel(item.service_type);
    const titleLines = wrap(title, fonts.bold, 10.5, descMaxW);
    const detail = lineDetail(item);
    const dateText = item.service_date ? `Service date: ${formatLongDate(item.service_date)}` : null;
    const extra = (detail ? 1 : 0) + (dateText ? 1 : 0);
    const h = titleLines.length * 13 + extra * 11 + 12;
    return { item, title, titleLines, detail, dateText, h };
  });

  const headerH = 26;
  const totalsH = 24 * (1 + (invoice.discount_cents > 0 ? 1 : 0) + (invoice.tax_cents > 0 ? 1 : 0)) + 14;
  const bodyH = rows.reduce((acc, r) => acc + r.h, 0);
  const cardH = headerH + bodyH + totalsH + 12;
  const cardY = topY - cardH;

  roundedCard(page, MARGIN, cardY, CONTENT_W, cardH, 14, { fill: WHITE, border: CARD_BORDER });

  // Column header band.
  fillRound(page, MARGIN, cardY + cardH - headerH, CONTENT_W, headerH, 0, HEADER_FILL);
  const hY = cardY + cardH - 17;
  page.drawText("SERVICE", { x: descX, y: hY, size: 8, font: fonts.bold, color: ACCENT_DEEP });
  page.drawText("QTY", { x: qtyX, y: hY, size: 8, font: fonts.bold, color: ACCENT_DEEP });
  page.drawText("RATE", { x: rateX, y: hY, size: 8, font: fonts.bold, color: ACCENT_DEEP });
  drawRight(page, "AMOUNT", amountRightX, hY, 8, fonts.bold, ACCENT_DEEP);

  let y = cardY + cardH - headerH - 16;
  for (const row of rows) {
    const baseY = y;
    row.titleLines.forEach((line, idx) => {
      page.drawText(line, { x: descX, y: baseY - idx * 13, size: 10.5, font: fonts.bold, color: INK });
    });
    let subY = baseY - row.titleLines.length * 13 + 1;
    if (row.detail) {
      page.drawText(row.detail, { x: descX, y: subY, size: 9, font: fonts.font, color: MUTED });
      subY -= 11;
    }
    if (row.dateText) {
      page.drawText(row.dateText, { x: descX, y: subY, size: 9, font: fonts.font, color: MUTED });
      subY -= 11;
    }
    const qtyText = row.item.unit_label === "flat" ? "—" : formatQuantity(row.item.quantity);
    const rateText = row.item.unit_label === "flat" ? "Flat" : `${formatCentsUsd(row.item.unit_amount_cents)}`;
    page.drawText(qtyText, { x: qtyX, y: baseY, size: 10, font: fonts.font, color: INK });
    page.drawText(rateText, { x: rateX, y: baseY, size: 10, font: fonts.font, color: INK });
    drawRight(page, formatCentsUsd(row.item.line_total_cents), amountRightX, baseY, 10.5, fonts.bold, INK);
    y -= row.h;
    // subtle divider
    page.drawLine({ start: { x: descX, y: y + 6 }, end: { x: amountRightX, y: y + 6 }, thickness: 0.5, color: CARD_BORDER });
  }

  // Totals.
  y -= 6;
  const totalsRows: Array<[string, string]> = [["Subtotal", formatCentsUsd(invoice.subtotal_cents)]];
  if (invoice.discount_cents > 0) totalsRows.push(["Discount", `- ${formatCentsUsd(invoice.discount_cents)}`]);
  if (invoice.tax_cents > 0) totalsRows.push(["Tax", formatCentsUsd(invoice.tax_cents)]);
  for (const [label, value] of totalsRows) {
    drawRight(page, label, rateX + 30, y, 9.5, fonts.font, MUTED);
    drawRight(page, value, amountRightX, y, 9.5, fonts.font, INK);
    y -= 16;
  }
  page.drawLine({ start: { x: rateX - 10, y: y + 4 }, end: { x: amountRightX, y: y + 4 }, thickness: 0.75, color: CARD_BORDER });
  y -= 6;
  drawRight(page, "Total", rateX + 30, y, 11, fonts.bold, INK);
  drawRight(page, formatCentsUsd(invoice.total_cents), amountRightX, y, 12, fonts.bold, ACCENT_DEEP);

  return cardY - 18;
}

function drawPaymentOptions(page: PDFPage, fonts: Fonts, topY: number, invoice: PrivatePayInvoiceWithItems): number {
  const cardH = 104;
  const cardY = topY - cardH;
  roundedCard(page, MARGIN, cardY, CONTENT_W, cardH, 14, { fill: CARD_FILL, border: CARD_BORDER });
  const pad = MARGIN + 16;
  let y = cardY + cardH - 22;
  page.drawText("PAYMENT OPTIONS", { x: pad, y, size: 8, font: fonts.bold, color: ACCENT });
  y -= 16;
  page.drawText("Pay by secure card link", { x: pad, y, size: 11, font: fonts.bold, color: INK });
  y -= 13;
  page.drawText("Use the secure payment link sent by Saintly by email or text. Apple Pay is supported.", {
    x: pad,
    y,
    size: 9,
    font: fonts.font,
    color: MUTED,
  });
  y -= 18;
  // Method chips.
  let cx = pad;
  const chips: Array<[string, RGB, RGB]> = [
    ["Card / Apple Pay", rgb(0.88, 0.93, 1), ACCENT_DEEP],
    ["Zelle", WHITE, INK],
    ["Cash App", WHITE, INK],
    ["Apple Cash", WHITE, INK],
    ["Cash / Check", WHITE, INK],
  ];
  for (const [label, fill, color] of chips) {
    const w = drawChip(page, fonts, label, cx, y - 14, fill, color, 8.5);
    cx += w + 8;
  }
  y -= 30;
  page.drawText(`Manual payments (Zelle, Cash App, Apple Cash, cash, check) should reference invoice ${invoice.invoice_number}.`, {
    x: pad,
    y,
    size: 8,
    font: fonts.font,
    color: MUTED,
  });
  return cardY - 16;
}

function drawReceiptDetail(page: PDFPage, fonts: Fonts, topY: number, invoice: PrivatePayInvoiceWithItems, payment: PrivatePayPayment | null): number {
  const cardH = 76;
  const cardY = topY - cardH;
  roundedCard(page, MARGIN, cardY, CONTENT_W, cardH, 14, { fill: rgb(0.93, 0.98, 0.95), border: rgb(0.7, 0.88, 0.78) });
  const pad = MARGIN + 16;
  let y = cardY + cardH - 22;
  page.drawText("PAYMENT RECEIVED", { x: pad, y, size: 8, font: fonts.bold, color: PAID_GREEN });
  y -= 18;
  page.drawText(`Status: Paid`, { x: pad, y, size: 11, font: fonts.bold, color: PAID_GREEN });
  y -= 15;
  const detail = [
    `Paid date: ${formatLongDate(payment?.paid_at ?? invoice.paid_at)}`,
    `Method: ${formatPaymentDetail(payment)}`,
  ].join("     ");
  page.drawText(detail, { x: pad, y, size: 9.5, font: fonts.font, color: INK });
  return cardY - 16;
}

function drawFooter(page: PDFPage, fonts: Fonts) {
  const cx = PAGE_W / 2;
  let y = MARGIN + 44;
  drawCenter(page, PRIVATE_PAY_BUSINESS.receiptFooter, cx, y, 10.5, fonts.bold, ACCENT_DEEP);
  y -= 13;
  drawCenter(page, "Care that goes above.", cx, y, 9.5, fonts.font, GOLD);
  y -= 16;
  drawCenter(
    page,
    "This document covers private-pay services only and contains no diagnosis, insurance, Medicare, or clinical information.",
    cx,
    y,
    7.5,
    fonts.font,
    MUTED
  );
  y -= 11;
  drawCenter(
    page,
    `${PRIVATE_PAY_BUSINESS.legalName}  |  ${PRIVATE_PAY_BUSINESS.phoneDisplay}  |  ${PRIVATE_PAY_BUSINESS.email}  ·  Generated by Saintly CRM`,
    cx,
    y,
    7.5,
    fonts.font,
    MUTED
  );
}

async function buildDocument(
  invoice: PrivatePayInvoiceWithItems,
  variant: "invoice" | "receipt",
  payment: PrivatePayPayment | null
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { font, bold };
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const isReceipt = variant === "receipt";

  let y = await drawHeader(doc, page, fonts, isReceipt);
  y = drawMetaRow(page, fonts, y, invoice, isReceipt, payment);
  y = drawBillToAndAmount(page, fonts, y, invoice, isReceipt, payment);
  y = drawServiceTable(page, fonts, y, invoice);
  y = isReceipt
    ? drawReceiptDetail(page, fonts, y, invoice, payment)
    : drawPaymentOptions(page, fonts, y, invoice);

  if ((invoice.notes ?? "").trim()) {
    page.drawText("NOTES", { x: MARGIN + 2, y, size: 7.5, font: bold, color: MUTED });
    y -= 12;
    for (const line of wrap(invoice.notes!.trim(), font, 9, CONTENT_W - 4)) {
      page.drawText(line, { x: MARGIN + 2, y, size: 9, font, color: MUTED });
      y -= 11;
    }
  }

  drawFooter(page, fonts);
  return doc.save();
}

export async function generatePrivatePayInvoicePdf(invoice: PrivatePayInvoiceWithItems): Promise<Uint8Array> {
  return buildDocument(invoice, "invoice", null);
}

export async function generatePrivatePayReceiptPdf(invoice: PrivatePayInvoiceWithItems): Promise<Uint8Array> {
  const paid = invoice.payments.find((p) => p.status === "succeeded") ?? invoice.payments[0] ?? null;
  return buildDocument(invoice, "receipt", paid);
}
