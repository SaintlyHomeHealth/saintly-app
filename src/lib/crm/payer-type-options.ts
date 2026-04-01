/**
 * Broad payer category stored in `patients.payer_type` / `leads.payer_type`.
 * `payer_name` holds the specific plan/program label (see payer-options).
 */
export const PAYER_BROAD_CATEGORY_OPTIONS = [
  "Medicare",
  "Medicaid",
  "Private Pay",
  "Private Insurance",
  "Other",
] as const;

export type PayerBroadCategory = (typeof PAYER_BROAD_CATEGORY_OPTIONS)[number];

const SET = new Set<string>(PAYER_BROAD_CATEGORY_OPTIONS);

export function isKnownPayerBroadCategory(v: string | null | undefined): v is PayerBroadCategory {
  return typeof v === "string" && SET.has(v.trim());
}
