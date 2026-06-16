import type { PrivatePayInvoicePaymentBadge } from "@/lib/private-pay/types";

export const PRIVATE_PAY_PAYMENT_BADGE_LABELS: Record<PrivatePayInvoicePaymentBadge, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  failed: "Failed",
  card_on_file: "Card on file",
  processing: "Processing",
};

export const PRIVATE_PAY_PAYMENT_BADGE_STYLES: Record<PrivatePayInvoicePaymentBadge, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  paid: "bg-emerald-100 text-emerald-900",
  failed: "bg-rose-100 text-rose-900",
  card_on_file: "bg-sky-100 text-sky-900",
  processing: "bg-amber-100 text-amber-900",
};

export function formatCardBrandLabel(brand: string | null): string {
  if (!brand) return "Card";
  const normalized = brand.toLowerCase();
  if (normalized === "amex") return "American Express";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function formatSavedCardLabel(
  brand: string | null,
  last4: string | null,
  expMonth: number | null,
  expYear: number | null
): string {
  const label = formatCardBrandLabel(brand);
  const digits = last4 ?? "????";
  const exp =
    expMonth && expYear ? `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}` : "—";
  return `${label} ending in ${digits} · exp ${exp}`;
}
