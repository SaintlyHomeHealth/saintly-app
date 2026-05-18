import { normalizePhone } from "@/lib/phone/us-phone-format";
import { normalizeFaxNumberToE164 } from "@/lib/fax/phone-numbers";

function nanpInputDigits(value: string): string {
  let digits = normalizePhone(value);
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

function formatNanpProgressive(d: string): string {
  const len = d.length;
  if (len <= 2) return d;
  if (len === 3) return `(${d}`;
  if (len <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Format US phone/fax for controlled inputs while typing.
 * Strips non-digits, caps at 10 NANP digits (drops leading US 1), inserts () and -.
 */
export function formatPhoneFaxInput(value: string): string {
  const digits = nanpInputDigits(value);
  if (digits.length === 0) return "";
  return formatNanpProgressive(digits);
}

/** E.164 for fax send API (+1XXXXXXXXXX for US 10-digit). */
export function normalizePhoneFaxForSend(value: string): string {
  return normalizeFaxNumberToE164(value) ?? "";
}

/** Pretty-print for fax cover sheet PDF and read-only display. */
export function formatFaxPhoneDisplay(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return formatPhoneFaxInput(raw) || raw;
}
