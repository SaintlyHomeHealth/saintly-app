import {
  PRIVATE_PAY_SERVICE_TYPE_LABELS,
  isPrivatePayServiceType,
  type PrivatePayUnitLabel,
} from "@/lib/private-pay/constants";

/** Format integer cents as USD, e.g. 20000 -> "$200.00". */
export function formatCentsUsd(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe / 100);
}

/** Parse a user-entered dollar string (e.g. "$100", "100.5") into integer cents. */
export function dollarsToCents(input: string | number | null | undefined): number {
  if (input == null) return 0;
  const raw = typeof input === "number" ? String(input) : input;
  const cleaned = raw.replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned) return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Compute the line total in cents from quantity x unit amount (rounded). */
export function computeLineTotalCents(quantity: number, unitAmountCents: number): number {
  const q = Number.isFinite(quantity) ? quantity : 0;
  const u = Number.isFinite(unitAmountCents) ? unitAmountCents : 0;
  return Math.max(0, Math.round(q * u));
}

/** Pluralize the unit noun for receipt display. flat -> "flat rate". */
export function unitLabelNoun(unit: PrivatePayUnitLabel, quantity: number): string {
  if (unit === "flat") return "flat rate";
  const plural = quantity === 1 ? "" : "s";
  return `${unit}${plural}`;
}

/** Format a clean quantity (drop trailing ".00"). */
export function formatQuantity(quantity: number): string {
  const q = Number.isFinite(quantity) ? quantity : 0;
  return Number.isInteger(q) ? String(q) : String(Number.parseFloat(q.toFixed(2)));
}

/**
 * Human line description for a receipt, e.g.
 *   "Respite Care — 2 visits x $100.00 = $200.00"
 *   "Personal Care — 4 hours x $50.00 = $200.00"
 *   "Skilled Nursing — flat rate $200.00"
 */
export function formatLineSummary(opts: {
  service_type: string;
  description?: string | null;
  quantity: number;
  unit_label: PrivatePayUnitLabel;
  unit_amount_cents: number;
  line_total_cents: number;
}): string {
  const serviceLabel = isPrivatePayServiceType(opts.service_type)
    ? PRIVATE_PAY_SERVICE_TYPE_LABELS[opts.service_type]
    : "Service";
  const title = (opts.description ?? "").trim() || serviceLabel;

  if (opts.unit_label === "flat") {
    return `${title} — flat rate ${formatCentsUsd(opts.line_total_cents)}`;
  }

  const noun = unitLabelNoun(opts.unit_label, opts.quantity);
  return `${title} — ${formatQuantity(opts.quantity)} ${noun} x ${formatCentsUsd(
    opts.unit_amount_cents
  )} = ${formatCentsUsd(opts.line_total_cents)}`;
}

/** Short service-type label, falling back to a generic word. */
export function serviceTypeLabel(value: string): string {
  return isPrivatePayServiceType(value) ? PRIVATE_PAY_SERVICE_TYPE_LABELS[value] : "Service";
}

/** "Visa ending in 1234" — for receipts. */
export function formatCardSummary(brand: string | null, last4: string | null): string | null {
  if (!last4) return null;
  const niceBrand = brand
    ? brand.charAt(0).toUpperCase() + brand.slice(1).replace(/_/g, " ")
    : "Card";
  return `${niceBrand} ending in ${last4}`;
}
