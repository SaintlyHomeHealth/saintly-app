import { normalizePhone } from "@/lib/phone/us-phone-format";

export type IncomingCallerContactRow = {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
};

export function buildIncomingContactDisplayName(row: IncomingCallerContactRow): string | null {
  const fn = (row.full_name ?? "").trim();
  if (fn) return fn;
  const org = (row.organization_name ?? "").trim();
  if (org) return org;
  const first = (row.first_name ?? "").trim();
  const last = (row.last_name ?? "").trim();
  const combined = `${first} ${last}`.trim();
  return combined || null;
}

/** Compare Twilio-style digits to a stored CRM phone (any punctuation). */
export function normalizedPhonesEquivalent(stored: string | null | undefined, digitsKey: string): boolean {
  const s = normalizePhone(stored ?? "");
  if (!s || !digitsKey) return false;
  if (s === digitsKey) return true;
  const k10 = digitsKey.slice(-10);
  const s10 = s.slice(-10);
  if (k10.length === 10 && s10.length === 10 && k10 === s10) return true;
  return false;
}
