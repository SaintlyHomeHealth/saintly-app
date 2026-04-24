import { randomInt } from "crypto";

export const STAFF_TEMP_PASSWORD_MIN = 6;
export const STAFF_TEMP_PASSWORD_MAX = 72;

/** Zero-width space, ZWJ, ZWNJ, BOM — same removal as public.normalize_staff_work_email() in Postgres. */
const STAFF_EMAIL_INVISIBLE = /[\u200B-\u200D\uFEFF]/g;

/**
 * Canonical work email for comparisons, forms, and inserts — must match
 * `normalize_staff_work_email` in the database (trim, lowercase, strip ZWSP/BOM).
 * Empty / null input yields "" (callers treat as missing).
 */
export function normalizeStaffLookupEmail(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== "string") return "";
  const s = raw.replace(STAFF_EMAIL_INVISIBLE, "").trim().toLowerCase();
  return s;
}

/** Cryptographically strong temp password for admin handoff (shown once; stored only as Auth hash). */
export function generateServerTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const nums = "23456789";
  const sym = "!@#$%&*";
  const all = upper + lower + nums + sym;
  const length = 16;
  const pick = (set: string) => set[randomInt(set.length)]!;
  const buf: string[] = [pick(upper), pick(lower), pick(nums), pick(sym)];
  for (let i = 4; i < length; i++) {
    buf.push(pick(all));
  }
  for (let i = buf.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [buf[i], buf[j]] = [buf[j]!, buf[i]!];
  }
  return buf.join("");
}
