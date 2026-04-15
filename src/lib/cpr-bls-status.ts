/**
 * Canonical values for `applicants.cpr_bls_status` (onboarding + compliance reporting).
 */
export const CPR_BLS_STATUS_VALUES = ['active', 'expired', 'not_certified'] as const

export type CprBlsStatusValue = (typeof CPR_BLS_STATUS_VALUES)[number]

export const CPR_BLS_STATUS_LABELS: Record<CprBlsStatusValue, string> = {
  active: 'Active',
  expired: 'Expired',
  not_certified: 'Not Certified',
}

export function isCprBlsStatusValue(value: string): value is CprBlsStatusValue {
  return (CPR_BLS_STATUS_VALUES as readonly string[]).includes(value)
}

/** Only exact canonical values (and spaced "not certified") hydrate from DB; legacy free text maps to ''. */
export function normalizeCprBlsStatusFromDb(raw: string | null | undefined): CprBlsStatusValue | '' {
  if (raw == null) return ''
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (s === '') return ''
  if (s === 'active') return 'active'
  if (s === 'expired') return 'expired'
  if (s === 'not_certified' || s === 'not certified') return 'not_certified'
  return ''
}
