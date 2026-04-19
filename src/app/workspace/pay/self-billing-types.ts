export const BILLING_LINE_TYPES = [
  { value: "soc", label: "SOC" },
  { value: "visit", label: "Visit" },
  { value: "discharge", label: "Discharge" },
  { value: "recert", label: "Recert" },
  { value: "other", label: "Other" },
] as const;

export type BillingLineType = (typeof BILLING_LINE_TYPES)[number]["value"];

export function billingLineLabel(value: string): string {
  const hit = BILLING_LINE_TYPES.find((t) => t.value === value);
  return hit?.label ?? value;
}
