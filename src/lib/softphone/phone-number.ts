/** Basic E.164 check (ITU-T E.164: + followed by 1–15 digits, first digit non-zero). */
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(value.trim());
}

/**
 * Normalize common US entry formats to E.164 (+1…).
 * Returns null if the result is not a plausible E.164.
 */
export function normalizeDialInputToE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  let n = digits;
  if (n.length === 10) {
    n = `1${n}`;
  }
  if (n.length === 11 && n.startsWith("1")) {
    return `+${n}`;
  }
  if (raw.trim().startsWith("+") && n.length >= 10 && n.length <= 15) {
    return `+${n}`;
  }
  return null;
}
