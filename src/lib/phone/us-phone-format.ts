/**
 * US-oriented phone display and storage helpers for CRM UI.
 * Twilio / E.164 dialing is unchanged: use `normalizeDialInputToE164` at send time when needed.
 */

/** Strip all non-digits (empty / null-safe). */
export function normalizePhone(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function formatNanpProgressive(d: string): string {
  const len = d.length;
  if (len <= 2) return d;
  if (len === 3) return `(${d}`;
  if (len <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Pretty-print for display and controlled inputs.
 * - 10-digit NANP → (XXX) XXX-XXXX
 * - 11 digits starting with 1 → national 10 formatted (US country code dropped from display)
 * - Fewer digits → progressive format while typing (1→1, 12→12, 123→(123, …)
 * - Other lengths → "+{digits}" for rough international readability
 */
export function formatPhoneNumber(value: string | null | undefined): string {
  const digits = normalizePhone(value);
  if (digits.length === 0) return "";

  if (digits.length === 11 && digits.startsWith("1")) {
    return formatNanpProgressive(digits.slice(1));
  }

  if (digits.length > 11) {
    return `+${digits}`;
  }

  return formatNanpProgressive(digits);
}

/** `tel:` href for click-to-call; does not persist. Supports 10-digit, 11-digit US, and other digit lengths. */
export function phoneToTelHref(value: string | null | undefined): string | null {
  const d = normalizePhone(value ?? "");
  if (d.length === 0) return null;
  if (d.length === 10) return `tel:+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `tel:+${d}`;
  return `tel:+${d}`;
}

/** Display line: formatted number or em dash when empty. */
export function formatPhoneForDisplay(value: string | null | undefined): string {
  const f = formatPhoneNumber(String(value ?? ""));
  return f === "" ? "—" : f;
}
