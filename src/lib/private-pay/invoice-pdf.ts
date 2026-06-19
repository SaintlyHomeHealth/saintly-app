import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

import { loadPrivatePayBrandLogos } from "@/lib/private-pay/brand-assets";
import {
  PRIVATE_PAY_BUSINESS,
  PRIVATE_PAY_UNIT_LABEL_OPTIONS,
} from "@/lib/private-pay/constants";
import {
  formatCentsUsd,
  formatPaymentDetail,
  formatQuantity,
  serviceTypeLabel,
} from "@/lib/private-pay/format";
import type { PrivatePayInvoiceWithItems, PrivatePayPayment } from "@/lib/private-pay/types";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PAD = 16;

// Premium soft-blue / white medical palette with a gold halo accent.
const INK = rgb(0.11, 0.15, 0.22);
const MUTED = rgb(0.45, 0.5, 0.58);
const FAINT = rgb(0.62, 0.66, 0.72);
const ACCENT = rgb(0.13, 0.42, 0.66);
const ACCENT_DEEP = rgb(0.06, 0.24, 0.42);
const SOFT_BLUE = rgb(0.937, 0.962, 0.992);
const HEADER_BADGE = rgb(0.88, 0.93, 0.99);
const BORDER = rgb(0.8, 0.87, 0.95);
const GOLD = rgb(0.84, 0.66, 0.16);
const GOLD_SOFT = rgb(0.98, 0.91, 0.66);
const GREEN = rgb(0.05, 0.5, 0.32);
const GREEN_SOFT = rgb(0.86, 0.96, 0.9);
const GREEN_BORDER = rgb(0.7, 0.88, 0.78);
const RED = rgb(0.72, 0.22, 0.22);
const RED_SOFT = rgb(0.99, 0.91, 0.91);
const SLATE_SOFT = rgb(0.93, 0.94, 0.96);
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
  page.drawText(text, { x: rightX - font.widthOfTextAtSize(text, size), y, size, font, color });
}

function drawCenter(page: PDFPage, text: string, centerX: number, y: number, size: number, font: PDFFont, color = INK) {
  page.drawText(text, { x: centerX - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

function fitContain(imgW: number, imgH: number, maxW: number, maxH: number): { w: number; h: number } {
  const scale = Math.min(maxW / imgW, maxH / imgH);
  return { w: imgW * scale, h: imgH * scale };
}

/** Filled rounded rectangle approximated with rectangles + corner circles. */
function fillRound(page: PDFPage, x: number, y: number, w: number, h: number, r: number, color: RGB, opacity = 1) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
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

function card(
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

function chip(page: PDFPage, fonts: Fonts, label: string, x: number, y: number, fill: RGB, textColor: RGB, size = 8.5): number {
  const padX = 9;
  const w = fonts.bold.widthOfTextAtSize(label, size) + padX * 2;
  const h = size + 9;
  fillRound(page, x, y, w, h, h / 2, fill);
  page.drawText(label, { x: x + padX, y: y + 4.5, size, font: fonts.bold, color: textColor });
  return w;
}

function longDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Phoenix" }).format(d);
}

function statusBadge(page: PDFPage, fonts: Fonts, status: string, x: number, y: number, forcePaid = false): number {
  if (forcePaid || status === "paid" || status === "refunded") {
    return chip(page, fonts, "PAID", x, y, GREEN_SOFT, GREEN, 9);
  }
  if (status === "void") return chip(page, fonts, "VOID", x, y, SLATE_SOFT, MUTED, 9);
  return chip(page, fonts, "UNPAID", x, y, RED_SOFT, RED, 9);
}

function isPaidPrivatePayDocument(invoice: PrivatePayInvoiceWithItems, variant: "invoice" | "receipt"): boolean {
  return variant === "receipt" || invoice.status === "paid" || invoice.status === "refunded";
}

function resolveSucceededPayment(invoice: PrivatePayInvoiceWithItems): PrivatePayPayment | null {
  return invoice.payments.find((p) => p.status === "succeeded") ?? invoice.payments[0] ?? null;
}

async function drawHeader(doc: PDFDocument, page: PDFPage, fonts: Fonts, isReceipt: boolean, invoice: PrivatePayInvoiceWithItems): Promise<number> {
  const top = PAGE_H - MARGIN;
  const logos = await loadPrivatePayBrandLogos();

  // Soft gold glow behind the icon (the mark already carries its own halo).
  const iconBox = 50;
  const haloCx = MARGIN + iconBox / 2;
  const haloCy = top - iconBox / 2 - 2;
  page.drawCircle({ x: haloCx, y: haloCy, size: 30, color: GOLD_SOFT, opacity: 0.16 });

  if (logos.icon) {
    try {
      const img: PDFImage = logos.icon.kind === "jpeg" ? await doc.embedJpg(logos.icon.bytes) : await doc.embedPng(logos.icon.bytes);
      const { w, h } = fitContain(img.width, img.height, iconBox, iconBox);
      page.drawImage(img, { x: haloCx - w / 2, y: haloCy - h / 2, width: w, height: h });
    } catch {
      /* optional */
    }
  }
  if (logos.wordmark) {
    try {
      const img: PDFImage = logos.wordmark.kind === "jpeg" ? await doc.embedJpg(logos.wordmark.bytes) : await doc.embedPng(logos.wordmark.bytes);
      const { w, h } = fitContain(img.width, img.height, 168, 40);
      page.drawImage(img, { x: MARGIN + iconBox + 8, y: haloCy - h / 2, width: w, height: h });
    } catch {
      /* optional */
    }
  } else {
    page.drawText(PRIVATE_PAY_BUSINESS.legalName, { x: MARGIN + iconBox + 8, y: haloCy - 5, size: 14, font: fonts.bold, color: ACCENT_DEEP });
  }

  // Right-side title badge.
  const badgeW = 196;
  const badgeH = 50;
  const badgeX = PAGE_W - MARGIN - badgeW;
  const badgeY = top - badgeH;
  card(page, badgeX, badgeY, badgeW, badgeH, 12, { fill: HEADER_BADGE });
  drawRight(page, isReceipt ? "PRIVATE PAY RECEIPT" : "PRIVATE PAY INVOICE", badgeX + badgeW - 14, badgeY + badgeH - 21, 14, fonts.bold, ACCENT_DEEP);
  drawRight(page, isReceipt ? "Payment received" : "Due upon receipt", badgeX + badgeW - 14, badgeY + 13, 9, fonts.font, ACCENT);

  // Gold rule under the header.
  let y = top - 64;
  page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 2, color: GOLD });
  y -= 16;

  // Business contact (left) + invoice meta (right).
  const contactLines = [
    PRIVATE_PAY_BUSINESS.legalName,
    PRIVATE_PAY_BUSINESS.addressFull,
    `Phone ${PRIVATE_PAY_BUSINESS.phoneDisplay}`,
    `${PRIVATE_PAY_BUSINESS.email}  ·  ${PRIVATE_PAY_BUSINESS.website}`,
  ];
  let cy = y;
  contactLines.forEach((line, idx) => {
    page.drawText(line, { x: MARGIN, y: cy, size: idx === 0 ? 9.5 : 8.5, font: idx === 0 ? fonts.bold : fonts.font, color: idx === 0 ? INK : MUTED });
    cy -= idx === 0 ? 13 : 11;
  });

  // Meta block on the right.
  const metaRightX = PAGE_W - MARGIN;
  let my = y;
  page.drawText("INVOICE #", { x: metaRightX - 150, y: my, size: 7.5, font: fonts.bold, color: FAINT });
  drawRight(page, invoice.invoice_number, metaRightX, my, 10.5, fonts.bold, INK);
  my -= 16;
  page.drawText(isReceipt ? "RECEIPT DATE" : "INVOICE DATE", { x: metaRightX - 150, y: my, size: 7.5, font: fonts.bold, color: FAINT });
  drawRight(page, longDate(isReceipt ? invoice.paid_at : invoice.created_at), metaRightX, my, 10, fonts.font, INK);
  my -= 16;
  page.drawText("STATUS", { x: metaRightX - 150, y: my, size: 7.5, font: fonts.bold, color: FAINT });
  const forcePaid = isReceipt;
  statusBadge(page, fonts, invoice.status, metaRightX - 56, my - 3, forcePaid);

  return Math.min(cy, my) - 16;
}

function drawBillAndAmount(page: PDFPage, fonts: Fonts, topY: number, invoice: PrivatePayInvoiceWithItems, isReceipt: boolean, payment: PrivatePayPayment | null): number {
  const gap = 14;
  const colW = (CONTENT_W - gap) / 2;
  const cardH = 108;
  const cardY = topY - cardH;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gap;

  // BILL TO
  card(page, leftX, cardY, colW, cardH, 12, { fill: WHITE, border: BORDER });
  let ly = cardY + cardH - 20;
  page.drawText("BILL TO", { x: leftX + PAD, y: ly, size: 8, font: fonts.bold, color: ACCENT });
  ly -= 18;
  page.drawText((invoice.billing_name ?? "").trim() || "Private Pay Client", { x: leftX + PAD, y: ly, size: 13, font: fonts.bold, color: INK });
  ly -= 15;
  const detailLines = [
    (invoice.billing_phone ?? "").trim(),
    (invoice.billing_email ?? "").trim(),
    (invoice.billing_address ?? "").trim(),
  ].filter(Boolean);
  for (const line of detailLines) {
    for (const w of wrap(line, fonts.font, 9.5, colW - PAD * 2)) {
      page.drawText(w, { x: leftX + PAD, y: ly, size: 9.5, font: fonts.font, color: MUTED });
      ly -= 12;
    }
  }

  // AMOUNT
  card(page, rightX, cardY, colW, cardH, 12, { fill: SOFT_BLUE, border: BORDER });
  let ry = cardY + cardH - 20;
  page.drawText(isReceipt ? "TOTAL PAID" : "AMOUNT DUE", { x: rightX + PAD, y: ry, size: 8, font: fonts.bold, color: isReceipt ? GREEN : ACCENT });
  ry -= 34;
  const amountText = formatCentsUsd(invoice.total_cents);
  page.drawText(amountText, { x: rightX + PAD, y: ry, size: 28, font: fonts.bold, color: isReceipt ? GREEN : ACCENT_DEEP });
  statusBadge(page, fonts, invoice.status, rightX + PAD + fonts.bold.widthOfTextAtSize(amountText, 28) + 12, ry + 6, isReceipt);
  ry -= 20;
  if (isReceipt) {
    const paidLine = `Paid ${longDate(payment?.paid_at ?? invoice.paid_at)}`;
    page.drawText(paidLine, { x: rightX + PAD, y: ry, size: 8.5, font: fonts.font, color: MUTED });
    ry -= 11;
    const methodLine = `Method: ${formatPaymentDetail(payment)}`;
    for (const w of wrap(methodLine, fonts.font, 8.5, colW - PAD * 2)) {
      page.drawText(w, { x: rightX + PAD, y: ry, size: 8.5, font: fonts.font, color: MUTED });
      ry -= 11;
    }
  } else {
    const note = "Payment instructions are below.";
    page.drawText(note, { x: rightX + PAD, y: ry, size: 8.5, font: fonts.font, color: MUTED });
  }

  return cardY - 16;
}

function drawServiceTable(page: PDFPage, fonts: Fonts, topY: number, invoice: PrivatePayInvoiceWithItems, isReceipt: boolean): number {
  const x = MARGIN;
  const innerL = x + PAD;
  const qtyRightX = x + CONTENT_W - 270;
  const unitX = x + CONTENT_W - 250;
  const rateRightX = x + CONTENT_W - 95;
  const amountRightX = x + CONTENT_W - PAD;
  const descMaxW = qtyRightX - innerL - 40;

  const rows = invoice.items.map((item) => {
    const title = serviceTypeLabel(item.service_type);
    const description = (item.description ?? "").trim();
    const descLines = description ? wrap(description, fonts.font, 9, descMaxW) : [];
    const dateText = item.service_date ? `Service date: ${longDate(item.service_date)}` : null;
    const h = 15 + descLines.length * 11 + (dateText ? 11 : 0) + 10;
    return { item, title, descLines, dateText, h };
  });

  const headerH = 24;
  const bodyH = rows.reduce((a, r) => a + r.h, 0);
  const totalsRows: Array<[string, string, boolean]> = [["Subtotal", formatCentsUsd(invoice.subtotal_cents), false]];
  if (invoice.discount_cents > 0) totalsRows.push(["Discount", `- ${formatCentsUsd(invoice.discount_cents)}`, false]);
  if (invoice.tax_cents > 0) totalsRows.push(["Tax", formatCentsUsd(invoice.tax_cents), false]);
  const totalsH = totalsRows.length * 15 + 26;
  const cardH = headerH + bodyH + totalsH + 12;
  const cardY = topY - cardH;

  card(page, x, cardY, CONTENT_W, cardH, 12, { fill: WHITE, border: BORDER });

  // Header band (inset so the card's rounded top corners stay clean).
  fillRound(page, x + 8, cardY + cardH - headerH - 1, CONTENT_W - 16, headerH - 2, 0, SOFT_BLUE);
  const hY = cardY + cardH - 16;
  page.drawText("SERVICE", { x: innerL, y: hY, size: 8, font: fonts.bold, color: ACCENT_DEEP });
  drawRight(page, "QTY", qtyRightX, hY, 8, fonts.bold, ACCENT_DEEP);
  page.drawText("UNIT", { x: unitX, y: hY, size: 8, font: fonts.bold, color: ACCENT_DEEP });
  drawRight(page, "RATE", rateRightX, hY, 8, fonts.bold, ACCENT_DEEP);
  drawRight(page, "AMOUNT", amountRightX, hY, 8, fonts.bold, ACCENT_DEEP);

  let y = cardY + cardH - headerH - 16;
  rows.forEach((row, idx) => {
    const baseY = y;
    page.drawText(row.title, { x: innerL, y: baseY, size: 10.5, font: fonts.bold, color: INK });
    let subY = baseY - 13;
    for (const line of row.descLines) {
      page.drawText(line, { x: innerL, y: subY, size: 9, font: fonts.font, color: MUTED });
      subY -= 11;
    }
    if (row.dateText) {
      page.drawText(row.dateText, { x: innerL, y: subY, size: 9, font: fonts.font, color: FAINT });
      subY -= 11;
    }
    const isFlat = row.item.unit_label === "flat";
    drawRight(page, isFlat ? "—" : formatQuantity(row.item.quantity), qtyRightX, baseY, 10, fonts.font, INK);
    page.drawText(isFlat ? "Flat" : PRIVATE_PAY_UNIT_LABEL_OPTIONS[row.item.unit_label].replace(/^Per /, ""), { x: unitX, y: baseY, size: 9.5, font: fonts.font, color: MUTED });
    drawRight(page, isFlat ? "—" : formatCentsUsd(row.item.unit_amount_cents), rateRightX, baseY, 10, fonts.font, INK);
    drawRight(page, formatCentsUsd(row.item.line_total_cents), amountRightX, baseY, 10.5, fonts.bold, INK);
    y -= row.h;
    if (idx < rows.length - 1) {
      page.drawLine({ start: { x: innerL, y: y + 6 }, end: { x: amountRightX, y: y + 6 }, thickness: 0.5, color: rgb(0.9, 0.93, 0.96) });
    }
  });

  // Totals.
  y -= 4;
  page.drawLine({ start: { x: rateRightX - 110, y: y + 8 }, end: { x: amountRightX, y: y + 8 }, thickness: 0.75, color: BORDER });
  for (const [label, value] of totalsRows) {
    drawRight(page, label, rateRightX, y, 9.5, fonts.font, MUTED);
    drawRight(page, value, amountRightX, y, 9.5, fonts.font, INK);
    y -= 15;
  }
  y -= 2;
  // Total due bar.
  const barH = 22;
  fillRound(page, rateRightX - 150, y - barH + 6, amountRightX - (rateRightX - 150), barH, 6, SOFT_BLUE);
  drawRight(page, isReceipt ? "TOTAL PAID" : "TOTAL DUE", rateRightX, y - 9, 11, fonts.bold, ACCENT_DEEP);
  drawRight(page, formatCentsUsd(invoice.total_cents), amountRightX, y - 10, 13, fonts.bold, ACCENT_DEEP);

  return cardY - 16;
}

/** Compact, secure-link-only payment instructions for unpaid invoices. */
function drawPaymentInstructions(page: PDFPage, fonts: Fonts, topY: number): number {
  const pad = MARGIN + PAD;
  const maxW = CONTENT_W - PAD * 2;

  const bodyLines = [
    `Pay securely using the payment link sent by ${PRIVATE_PAY_BUSINESS.legalName}.`,
    `If you have already paid or need help, contact Saintly at ${PRIVATE_PAY_BUSINESS.phoneDisplay}.`,
  ];

  let lineCount = 0;
  for (const line of bodyLines) lineCount += wrap(line, fonts.font, 9.5, maxW).length;

  const cardH = 30 + lineCount * 13;
  const cardY = topY - cardH;
  card(page, MARGIN, cardY, CONTENT_W, cardH, 12, { fill: SOFT_BLUE, border: BORDER });
  let y = cardY + cardH - 18;
  page.drawText("PAYMENT INSTRUCTIONS", { x: pad, y, size: 8, font: fonts.bold, color: ACCENT });
  y -= 15;

  for (const line of bodyLines) {
    for (const wrapped of wrap(line, fonts.font, 9.5, maxW)) {
      page.drawText(wrapped, { x: pad, y, size: 9.5, font: fonts.font, color: INK });
      y -= 13;
    }
  }

  return cardY - 14;
}

function drawReceiptDetail(
  page: PDFPage,
  fonts: Fonts,
  topY: number,
  invoice: PrivatePayInvoiceWithItems,
  payment: PrivatePayPayment | null
): number {
  const ref = (payment?.payment_reference ?? "").trim();
  const cardH = ref ? 118 : 104;
  const cardY = topY - cardH;
  card(page, MARGIN, cardY, CONTENT_W, cardH, 12, { fill: GREEN_SOFT, border: GREEN_BORDER });
  const pad = MARGIN + PAD;
  let y = cardY + cardH - 18;
  page.drawText("PRIVATE PAY RECEIPT", { x: pad, y, size: 8, font: fonts.bold, color: GREEN });
  y -= 16;
  page.drawText("Payment received", { x: pad, y, size: 12, font: fonts.bold, color: GREEN });
  y -= 18;
  page.drawText(`Paid date: ${longDate(payment?.paid_at ?? invoice.paid_at)}`, { x: pad, y, size: 9.5, font: fonts.font, color: INK });
  y -= 14;
  page.drawText(`Payment method: ${formatPaymentDetail(payment)}`, { x: pad, y, size: 9.5, font: fonts.font, color: INK });
  y -= 14;
  if (ref) {
    page.drawText(`Reference / confirmation: ${ref}`, { x: pad, y, size: 9.5, font: fonts.font, color: INK });
    y -= 14;
  }
  page.drawText(`Total paid: ${formatCentsUsd(invoice.total_cents)}`, { x: pad, y, size: 11, font: fonts.bold, color: GREEN });
  return cardY - 14;
}

function drawFooter(page: PDFPage, fonts: Fonts, isReceipt: boolean) {
  const cx = PAGE_W / 2;
  let y = MARGIN + 36;
  page.drawRectangle({ x: cx - 24, y: y + 12, width: 48, height: 2, color: GOLD });
  y -= 4;
  drawCenter(
    page,
    isReceipt ? "Thank you for your payment." : PRIVATE_PAY_BUSINESS.receiptFooter,
    cx,
    y,
    10,
    fonts.bold,
    ACCENT_DEEP
  );
  y -= 12;
  drawCenter(page, PRIVATE_PAY_BUSINESS.tagline, cx, y, 9, fonts.bold, GOLD);
  y -= 14;
  drawCenter(page, `${PRIVATE_PAY_BUSINESS.phoneDisplay}  ·  ${PRIVATE_PAY_BUSINESS.website}`, cx, y, 7.5, fonts.font, FAINT);
  y -= 10;
  drawCenter(
    page,
    "Private-pay services only — no diagnosis, insurance, Medicare, or clinical information.",
    cx,
    y,
    7,
    fonts.font,
    FAINT
  );
}

async function buildDocument(
  invoice: PrivatePayInvoiceWithItems,
  variant: "invoice" | "receipt"
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { font, bold };
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const isReceipt = isPaidPrivatePayDocument(invoice, variant);
  const payment = isReceipt ? resolveSucceededPayment(invoice) : null;

  let y = await drawHeader(doc, page, fonts, isReceipt, invoice);
  y = drawBillAndAmount(page, fonts, y, invoice, isReceipt, payment);
  y = drawServiceTable(page, fonts, y, invoice, isReceipt);
  if (isReceipt) {
    y = drawReceiptDetail(page, fonts, y, invoice, payment);
  } else {
    y = drawPaymentInstructions(page, fonts, y);
  }

  if ((invoice.notes ?? "").trim()) {
    page.drawText("NOTES", { x: MARGIN, y, size: 7.5, font: bold, color: FAINT });
    y -= 12;
    for (const line of wrap(invoice.notes!.trim(), font, 9, CONTENT_W)) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: MUTED });
      y -= 11;
    }
  }

  drawFooter(page, fonts, isReceipt);
  return doc.save();
}

export async function generatePrivatePayInvoicePdf(invoice: PrivatePayInvoiceWithItems): Promise<Uint8Array> {
  return buildDocument(invoice, "invoice");
}

export async function generatePrivatePayReceiptPdf(invoice: PrivatePayInvoiceWithItems): Promise<Uint8Array> {
  return buildDocument(invoice, "receipt");
}
