/**
 * When a payer is marked denied we schedule reapplication (server actions).
 * Change this constant to adjust the default follow-up horizon.
 */
export const CREDENTIALING_DENIED_REAPPLY_DAYS = 90;

/** Stored in next_action when marking denied (exact match for reporting consistency). */
export const CREDENTIALING_NEXT_ACTION_REAPPLY = "Reapply later";

export const PAYER_DENIAL_REASON_VALUES = [
  { value: "no_network_need", label: "No network need" },
  { value: "not_credentialed_ahcccs", label: "Not credentialed with AHCCCS" },
  { value: "rate_issue", label: "Rate issue" },
  { value: "incomplete_application", label: "Incomplete application" },
  { value: "other", label: "Other" },
] as const;

export type PayerDenialReasonValue = (typeof PAYER_DENIAL_REASON_VALUES)[number]["value"];

export function labelForDenialReasonValue(value: string): string {
  const row = PAYER_DENIAL_REASON_VALUES.find((x) => x.value === value);
  return row?.label ?? value;
}

/** Build one line for `payer_credentialing_records.denial_reason`. */
export function buildStoredDenialReason(category: string | null, otherDetail: string | null): string | null {
  const c = (category ?? "").trim();
  if (!c) return null;
  if (c === "other") {
    const detail = (otherDetail ?? "").trim();
    return detail ? `Other: ${detail}` : "Other";
  }
  const known = PAYER_DENIAL_REASON_VALUES.find((x) => x.value === c);
  return known ? known.label : c;
}
