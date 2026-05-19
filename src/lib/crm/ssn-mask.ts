/** Normalize SSN to 9 digits only (no dashes). Returns null if invalid length. */
export function normalizeSsnDigits(raw: string | null | undefined): string | null {
  const digits = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  if (digits.length !== 9) return null;
  return digits;
}

/** Format 9-digit SSN as XXX-XX-XXXX for display/input. */
export function formatSsnDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

/** Mask stored SSN for display — never log the raw value. */
export function maskSsnIdentifier(raw: string | null | undefined): string {
  const digits = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  if (!digits) return "";
  if (digits.length < 4) return "***-**-****";
  return `***-**-${digits.slice(-4)}`;
}
