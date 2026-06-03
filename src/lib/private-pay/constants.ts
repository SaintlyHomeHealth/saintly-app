import {
  ADDRESS_LINE_CITY,
  ADDRESS_LINE_STREET,
  EMAIL_INTAKE,
} from "@/components/marketing/marketing-constants";

/** Service categories billable as private pay. "custom" allows any ad-hoc service. */
export const PRIVATE_PAY_SERVICE_TYPES = [
  "respite_care",
  "personal_care",
  "skilled_nursing",
  "physical_therapy",
  "custom",
] as const;

export type PrivatePayServiceType = (typeof PRIVATE_PAY_SERVICE_TYPES)[number];

export const PRIVATE_PAY_SERVICE_TYPE_LABELS: Record<PrivatePayServiceType, string> = {
  respite_care: "Respite Care",
  personal_care: "Personal Care",
  skilled_nursing: "Skilled Nursing",
  physical_therapy: "Physical Therapy",
  custom: "Custom",
};

/** Billing unit for a line item. Drives how the receipt reads (per visit/hour/day or flat rate). */
export const PRIVATE_PAY_UNIT_LABELS = ["visit", "hour", "day", "flat"] as const;
export type PrivatePayUnitLabel = (typeof PRIVATE_PAY_UNIT_LABELS)[number];

export const PRIVATE_PAY_UNIT_LABEL_OPTIONS: Record<PrivatePayUnitLabel, string> = {
  visit: "Per visit",
  hour: "Per hour",
  day: "Per day",
  flat: "Flat rate",
};

export const PRIVATE_PAY_INVOICE_STATUSES = ["draft", "sent", "paid", "void", "refunded"] as const;
export type PrivatePayInvoiceStatus = (typeof PRIVATE_PAY_INVOICE_STATUSES)[number];

export const PRIVATE_PAY_INVOICE_STATUS_LABELS: Record<PrivatePayInvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
  refunded: "Refunded",
};

export const PRIVATE_PAY_PAYMENT_METHODS = ["card", "cash", "check", "zelle", "manual"] as const;
export type PrivatePayPaymentMethod = (typeof PRIVATE_PAY_PAYMENT_METHODS)[number];

export const PRIVATE_PAY_PAYMENT_METHOD_LABELS: Record<PrivatePayPaymentMethod, string> = {
  card: "Card",
  cash: "Cash",
  check: "Check",
  zelle: "Zelle",
  manual: "Manual / Other",
};

/** Saintly Home Health billing identity used on invoice + receipt PDFs. */
export const PRIVATE_PAY_BUSINESS = {
  legalName: "Saintly Home Health LLC",
  phoneDisplay: "(480) 360-0008",
  email: EMAIL_INTAKE,
  addressStreet: ADDRESS_LINE_STREET,
  addressCity: ADDRESS_LINE_CITY,
  addressFull: `${ADDRESS_LINE_STREET}, ${ADDRESS_LINE_CITY}`,
  receiptFooter: "Thank you for choosing Saintly Home Health LLC.",
} as const;

export function isPrivatePayServiceType(value: unknown): value is PrivatePayServiceType {
  return typeof value === "string" && (PRIVATE_PAY_SERVICE_TYPES as readonly string[]).includes(value);
}

export function isPrivatePayUnitLabel(value: unknown): value is PrivatePayUnitLabel {
  return typeof value === "string" && (PRIVATE_PAY_UNIT_LABELS as readonly string[]).includes(value);
}

export function isPrivatePayPaymentMethod(value: unknown): value is PrivatePayPaymentMethod {
  return typeof value === "string" && (PRIVATE_PAY_PAYMENT_METHODS as readonly string[]).includes(value);
}
