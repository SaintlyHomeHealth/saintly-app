import { normalizeFaxNumberToE164 } from "@/lib/fax/phone-numbers";

/** Basic NANP check: NXX (N=2-9), exchange first digit 2-9. */
const US_LOCAL_10 = /^[2-9]\d{2}[2-9]\d{6}$/;

/**
 * Normalize input and validate a US fax number (10-digit national number → E.164 +1…).
 * Accepts values like (480) 830-8417, 4808308417, +14808308417.
 */
export function validateUsFaxNumberToE164(
  raw: string | null | undefined
): { ok: true; e164: string } | { ok: false; error: string } {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a fax number." };
  }

  const e164 = normalizeFaxNumberToE164(trimmed);
  if (!e164) {
    return { ok: false, error: "Enter a valid fax number with 10 digits." };
  }

  if (!e164.startsWith("+1") || e164.length !== 12) {
    return { ok: false, error: "Only US fax numbers are supported. Use a 10-digit number." };
  }

  const national = e164.slice(2);
  if (!US_LOCAL_10.test(national)) {
    return { ok: false, error: "That does not look like a valid US fax number." };
  }

  return { ok: true, e164 };
}
