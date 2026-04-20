import { randomInt } from "crypto";

export const STAFF_TEMP_PASSWORD_MIN = 6;
export const STAFF_TEMP_PASSWORD_MAX = 72;

export function normalizeStaffLookupEmail(raw: string | null | undefined): string {
  return (typeof raw === "string" ? raw : "").trim().toLowerCase();
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
