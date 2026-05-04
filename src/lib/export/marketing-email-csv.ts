/**
 * Normalize + validate emails for marketing CSV exports (trim, lowercase, dedupe keys).
 */

const MARKETING_EMAIL_MAX_LEN = 254;

/** Practical single-address check — not full RFC 5322; rejects obvious junk. */
const MARKETING_EMAIL_RE =
  /^[a-z0-9._%+-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeMarketingEmail(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!t) return null;
  if (t.length > MARKETING_EMAIL_MAX_LEN) return null;
  return t;
}

export function isMarketingEmailValid(normalized: string): boolean {
  if (!normalized || normalized.length > MARKETING_EMAIL_MAX_LEN) return false;
  if (!normalized.includes("@")) return false;
  return MARKETING_EMAIL_RE.test(normalized);
}

/** Escape one CSV field (comma-separated, RFC-style quoting). */
export function csvEscapeCell(value: string): string {
  const v = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function csvRow(fields: string[]): string {
  return `${fields.map(csvEscapeCell).join(",")}\n`;
}
