/**
 * Recruiting CRM: canonical email/phone for duplicate detection and indexed columns.
 * Phone: US NANP numbers normalize to 10 digits; +1 and punctuation variants match.
 */

import { normalizePhone } from "@/lib/phone/us-phone-format";

/** Lowercase trimmed email, or null when empty. */
export function normalizeRecruitingEmail(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return s ? s : null;
}

/**
 * Canonical digit string for matching: 10-digit US numbers from 10- or 11-digit NANP input.
 * Other lengths: all digits preserved (international / edge cases).
 */
export function normalizeRecruitingPhoneForStorage(raw: string | null | undefined): string | null {
  const d = normalizePhone(raw);
  if (!d) return null;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  if (d.length > 10) return d;
  if (d.length >= 7) return d;
  return null;
}

/** Key for soft duplicate: same person + city (case-insensitive, trimmed). */
export function recruitingNameCityKey(fullName: string | null | undefined, city: string | null | undefined): string | null {
  const n = String(fullName ?? "").trim().toLowerCase();
  const c = String(city ?? "").trim().toLowerCase();
  if (!n || !c) return null;
  return `${n}|${c}`;
}
