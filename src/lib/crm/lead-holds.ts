/**
 * Boolean “hold” flags on `public.leads` (patient intake), surfaced in snapshot, list badges, and filters.
 * `waiting_on_doctors_orders` predates this module — config here starts with the insurance verification hold.
 */

/** DB column + URL `contactStatus` filter value (matches `leads.waiting_on_insurance_verification`). */
export const LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION_KEY = "waiting_on_insurance_verification" as const;

export type LeadHoldWaitingOnInsuranceVerificationKey = typeof LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION_KEY;

export const LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION = {
  key: LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION_KEY,
  column: "waiting_on_insurance_verification" as const,
  /** Leads list / export filter (`contactStatus` query param) */
  filterUrlValue: LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION_KEY,
  label: "Waiting on Insurance Verification",
  badgeText: "WAITING ON INSURANCE VERIFICATION",
  bannerEyebrow: "INSURANCE HOLD",
  /** Snapshot banner (active) + toggle row. */
  helperText: "Turn on when insurance eligibility or benefits still need verification.",
} as const;
