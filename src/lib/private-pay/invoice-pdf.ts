import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { loadSaintlyLogoForPdf } from "@/lib/fax/load-saintly-logo-pdf";
import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";
import {
  formatCardSummary,
  formatCentsUsd,
  formatQuantity,
  serviceTypeLabel,
  unitLabelNoun,
} from "@/lib/private-pay/format";
import type { PrivatePayInvoiceWithItems, PrivatePayPayment } from "@/lib/private-pay/types";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;

const INK = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.38, 0.4, 0.44);
const RULE = rgb(0.82, 0.84, 0.86);
const ACCENT = rgb(0.08, 0.42, 0.52);
const PAID_GREEN = rgb(0.06, 0.5, 0.32);

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

function formatPaidDate(iso: string | null): string {
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

function lineDescription(item: PrivatePayInvoiceWithItems["items"][number]): string {
  const base = (item.description ?? "").trim() || serviceTypeLabel(item.service_type);
  if (item.unit_label === "flat") {
    return `${base} (flat rate)`;
  }
  return `${base} — ${formatQuantity(item.quantity)} ${unitLabelNoun(item.unit_label, item.quantity)} × ${formatCentsUsd(
    item.unit_amount_cents
  )}`;
}

async function drawHeader(doc: PDFDocument, page: PDFPage, fonts: Fonts, title: string): Promise<number> {
  let y = PAGE_H - MARGIN;
  const logoAsset = await loadSaintlyLogoForPdf();
  if (logoAsset) {
    try {
      const logo =
        logoAsset.kind === "jpeg" ? await doc.embedJpg(logoAsset.bytes) : await doc.embedPng(logoAsset.bytes);
      const logoH = 46;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: MARGIN, y: y - logoH, width: logoW, height: logoH });
    } catch {
      /* optional logo */
    }
  }

  // Document title on the right.
  drawRight(page, title.toUpperCase(), PAGE_W - MARGIN, y - 10, 20, fonts.bold, ACCENT);
  y -= 58;

  page.drawText(PRIVATE_PAY_BUSINESS.legalName, { x: MARGIN, y, size: 12, font: fonts.bold, color: INK });
  y -= 14;
  const contactLines = [
    PRIVATE_PAY_BUSINESS.addressStreet,
    PRIVATE_PAY_BUSINESS.addressCity,
    `Phone: ${PRIVATE_PAY_BUSINESS.phoneDisplay}`,
    `Email: ${PRIVATE_PAY_BUSINESS.email}`,
  ];
  for (const line of contactLines) {
    page.drawText(line, { x: MARGIN, y, size: 9, font: fonts.font, color: MUTED });
    y -= 12;
  }

  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: RULE });
  return y - 24;
}

function drawMetaBlock(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  rows: Array<[string, string]>,
  isPaid: boolean
): number {
  const colX = PAGE_W - MARGIN - 220;
  let yy = y;
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), { x: colX, y: yy, size: 7.5, font: fonts.bold, color: MUTED });
    drawRight(page, value, PAGE_W - MARGIN, yy, 10, fonts.font, INK);
    yy -= 16;
  }
  if (isPaid) {
    page.drawText("STATUS", { x: colX, y: yy, size: 7.5, font: fonts.bold, color: MUTED });
    drawRight(page, "PAID", PAGE_W - MARGIN, yy, 12, fonts.bold, PAID_GREEN);
    yy -= 16;
  }
  return yy;
}

function drawBillTo(page: PDFPage, fonts: Fonts, y: number, invoice: PrivatePayInvoiceWithItems): number {
  let yy = y;
  page.drawText("BILL TO", { x: MARGIN, y: yy, size: 7.5, font: fonts.bold, color: MUTED });
  yy -= 16;
  const name = (invoice.billing_name ?? "").trim() || "Patient";
  page.drawText(name, { x: MARGIN, y: yy, size: 12, font: fonts.bold, color: INK });
  yy -= 14;
  const lines = [invoice.billing_address, invoice.billing_phone, invoice.billing_email]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
  for (const line of lines) {
    for (const wrapped of wrap(line, fonts.font, 9.5, 260)) {
      page.drawText(wrapped, { x: MARGIN, y: yy, size: 9.5, font: fonts.font, color: MUTED });
      yy -= 12;
    }
  }
  return yy;
}

function drawItemsTable(page: PDFPage, fonts: Fonts, y: number, invoice: PrivatePayInvoiceWithItems): number {
  let yy = y;
  const descX = MARGIN;
  const qtyX = PAGE_W - MARGIN - 180;
  const rateX = PAGE_W - MARGIN - 110;
  const amountRightX = PAGE_W - MARGIN;

  page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: PAGE_W - MARGIN, y: yy }, thickness: 0.75, color: RULE });
  yy -= 14;
  page.drawText("DESCRIPTION", { x: descX, y: yy, size: 7.5, font: fonts.bold, color: MUTED });
  page.drawText("QTY", { x: qtyX, y: yy, size: 7.5, font: fonts.bold, color: MUTED });
  page.drawText("RATE", { x: rateX, y: yy, size: 7.5, font: fonts.bold, color: MUTED });
  drawRight(page, "AMOUNT", amountRightX, yy, 7.5, fonts.bold, MUTED);
  yy -= 8;
  page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: PAGE_W - MARGIN, y: yy }, thickness: 0.75, color: RULE });
  yy -= 16;

  for (const item of invoice.items) {
    const descLines = wrap(lineDescription(item), fonts.font, 10, qtyX - descX - 12);
    const rowHeight = Math.max(descLines.length * 13, 16);
    descLines.forEach((line, idx) => {
      page.drawText(line, { x: descX, y: yy - idx * 13, size: 10, font: fonts.font, color: INK });
    });
    if (item.service_date) {
      page.drawText(`Service date: ${item.service_date}`, {
        x: descX,
        y: yy - descLines.length * 13,
        size: 8,
        font: fonts.font,
        color: MUTED,
      });
    }
    const qtyText = item.unit_label === "flat" ? "—" : formatQuantity(item.quantity);
    const rateText = item.unit_label === "flat" ? "Flat" : formatCentsUsd(item.unit_amount_cents);
    page.drawText(qtyText, { x: qtyX, y: yy, size: 10, font: fonts.font, color: INK });
    page.drawText(rateText, { x: rateX, y: yy, size: 10, font: fonts.font, color: INK });
    drawRight(page, formatCentsUsd(item.line_total_cents), amountRightX, yy, 10, fonts.font, INK);
    const extra = item.service_date ? 12 : 0;
    yy -= rowHeight + 8 + extra;
  }

  yy -= 4;
  page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: PAGE_W - MARGIN, y: yy }, thickness: 0.75, color: RULE });
  yy -= 18;

  const totalsRows: Array<[string, string, boolean]> = [["Subtotal", formatCentsUsd(invoice.subtotal_cents), false]];
  if (invoice.discount_cents > 0) totalsRows.push(["Discount", `- ${formatCentsUsd(invoice.discount_cents)}`, false]);
  if (invoice.tax_cents > 0) totalsRows.push(["Tax", formatCentsUsd(invoice.tax_cents), false]);

  for (const [label, value] of totalsRows) {
    page.drawText(label, { x: rateX - 30, y: yy, size: 10, font: fonts.font, color: MUTED });
    drawRight(page, value, amountRightX, yy, 10, fonts.font, INK);
    yy -= 15;
  }
  yy -= 2;
  return yy;
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
  let y = await drawHeader(doc, page, fonts, isReceipt ? "Receipt" : "Invoice");

  const metaRows: Array<[string, string]> = [];
  if (isReceipt && payment?.receipt_number) metaRows.push(["Receipt #", payment.receipt_number]);
  metaRows.push(["Invoice #", invoice.invoice_number]);
  if (isReceipt) {
    metaRows.push(["Paid date", formatPaidDate(payment?.paid_at ?? invoice.paid_at)]);
  } else {
    metaRows.push(["Date", formatPaidDate(invoice.created_at)]);
  }

  const metaBottom = drawMetaBlock(page, fonts, y, metaRows, isReceipt);
  const billBottom = drawBillTo(page, fonts, y, invoice);
  y = Math.min(metaBottom, billBottom) - 18;

  y = drawItemsTable(page, fonts, y, invoice);

  // Grand total line.
  const totalLabel = isReceipt ? "TOTAL PAID" : "TOTAL DUE";
  page.drawText(totalLabel, { x: PAGE_W - MARGIN - 200, y, size: 12, font: bold, color: INK });
  drawRight(page, formatCentsUsd(invoice.total_cents), PAGE_W - MARGIN, y, 14, bold, isReceipt ? PAID_GREEN : INK);
  y -= 26;

  if (isReceipt) {
    const cardSummary = formatCardSummary(payment?.card_brand ?? null, payment?.card_last4 ?? null);
    const methodLabel = cardSummary
      ? cardSummary
      : payment
        ? payment.payment_method.charAt(0).toUpperCase() + payment.payment_method.slice(1)
        : "—";
    page.drawText(`Payment method: ${methodLabel}`, { x: MARGIN, y, size: 10, font, color: INK });
    y -= 14;
    page.drawText("Status: Paid", { x: MARGIN, y, size: 10, font: bold, color: PAID_GREEN });
    y -= 20;
  }

  if ((invoice.notes ?? "").trim()) {
    page.drawText("NOTES", { x: MARGIN, y, size: 7.5, font: bold, color: MUTED });
    y -= 14;
    for (const line of wrap(invoice.notes!.trim(), font, 9.5, PAGE_W - MARGIN * 2)) {
      page.drawText(line, { x: MARGIN, y, size: 9.5, font, color: MUTED });
      y -= 12;
    }
  }

  // Footer.
  const footer = PRIVATE_PAY_BUSINESS.receiptFooter;
  const footerW = font.widthOfTextAtSize(footer, 10);
  page.drawText(footer, { x: (PAGE_W - footerW) / 2, y: MARGIN, size: 10, font, color: MUTED });

  return doc.save();
}

export async function generatePrivatePayInvoicePdf(
  invoice: PrivatePayInvoiceWithItems
): Promise<Uint8Array> {
  return buildDocument(invoice, "invoice", null);
}

export async function generatePrivatePayReceiptPdf(
  invoice: PrivatePayInvoiceWithItems
): Promise<Uint8Array> {
  const paid = invoice.payments.find((p) => p.status === "succeeded") ?? invoice.payments[0] ?? null;
  return buildDocument(invoice, "receipt", paid);
}
