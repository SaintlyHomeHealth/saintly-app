import { getAppBaseUrl } from "@/lib/app-url";

/**
 * Customer-facing invoice view (pay + download PDF). No login required.
 * Full URL pattern: https://app.saintlyhomehealth.com/p/private-pay/invoice/[publicToken]
 */
export const PRIVATE_PAY_PUBLIC_INVOICE_PATH = "/p/private-pay/invoice";

/**
 * Public invoice page — use in SMS/email. HIPAA-safe landing page with PDF download
 * and payment options (no diagnosis, Medicare, insurance, or clinical notes).
 */
export function buildPrivatePayInvoicePublicUrl(
  publicToken: string,
  baseUrl?: string
): string {
  const base = (baseUrl ?? getAppBaseUrl()).replace(/\/$/, "");
  const token = encodeURIComponent(publicToken.trim());
  const path = `${PRIVATE_PAY_PUBLIC_INVOICE_PATH}/${token}`;
  return base ? `${base}${path}` : path;
}

/** Direct invoice PDF (token-only API route). */
export function buildPrivatePayInvoicePdfUrl(
  publicToken: string,
  opts?: { baseUrl?: string; download?: boolean }
): string {
  const base = (opts?.baseUrl ?? getAppBaseUrl()).replace(/\/$/, "");
  const token = encodeURIComponent(publicToken.trim());
  const q = opts?.download ? "?download=1" : "";
  const path = `/api/private-pay/public/invoice/${token}/pdf${q}`;
  return base ? `${base}${path}` : path;
}

/** Direct receipt PDF after payment. */
export function buildPrivatePayReceiptPdfUrl(
  publicToken: string,
  opts?: { baseUrl?: string; download?: boolean }
): string {
  const base = (opts?.baseUrl ?? getAppBaseUrl()).replace(/\/$/, "");
  const token = encodeURIComponent(publicToken.trim());
  const q = opts?.download ? "?download=1" : "";
  const path = `/api/private-pay/public/invoice/${token}/receipt${q}`;
  return base ? `${base}${path}` : path;
}

export type PrivatePayDeliveryLinks = {
  invoiceUrl: string;
  pdfUrl: string;
  receiptUrl: string | null;
};

export function buildPrivatePayDeliveryLinks(
  publicToken: string,
  invoiceStatus: string,
  baseUrl?: string
): PrivatePayDeliveryLinks {
  const base = baseUrl ?? getAppBaseUrl();
  const receiptUrl =
    invoiceStatus === "paid" || invoiceStatus === "refunded"
      ? buildPrivatePayReceiptPdfUrl(publicToken, { baseUrl: base })
      : null;
  return {
    invoiceUrl: buildPrivatePayInvoicePublicUrl(publicToken, base),
    pdfUrl: buildPrivatePayInvoicePdfUrl(publicToken, { baseUrl: base }),
    receiptUrl,
  };
}
