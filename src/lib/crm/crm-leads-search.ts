/**
 * Admin CRM leads list: contact search OR-clause + client-side row match.
 * Phone matching uses digit normalization so "(602) 791-8506" finds stored 6027918506 / +1 formats.
 */

import { normalizePhone } from "@/lib/phone/us-phone-format";

import { contactDisplayName, contactEmail, type CrmLeadsContactEmb } from "./crm-leads-table-helpers";

/** Escape `%`, `_`, and `\` for Postgres ILIKE patterns. */
export function escapeForIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Digits only for phone matching (E.164 / NANP friendly). */
export function searchQueryDigits(q: string): string {
  return String(q ?? "").replace(/\D/g, "");
}

/**
 * Build `.or(...)` filter for `contacts` when searching by name / phone / email.
 * Returns null when q is empty (caller should skip contact pre-filter).
 */
export function buildContactSearchOrClause(qRaw: string): string | null {
  const q = qRaw.trim().slice(0, 120);
  if (!q) return null;

  const esc = escapeForIlike(q);
  const parts: string[] = [
    `full_name.ilike.%${esc}%`,
    `email.ilike.%${esc}%`,
    `primary_phone.ilike.%${esc}%`,
    `secondary_phone.ilike.%${esc}%`,
  ];

  const d = searchQueryDigits(q);
  if (d.length >= 7) {
    parts.push(`primary_phone.ilike.%${d}%`);
    parts.push(`secondary_phone.ilike.%${d}%`);
    if (d.length >= 10) {
      const last10 = d.slice(-10);
      parts.push(`primary_phone.ilike.%${last10}%`);
      parts.push(`secondary_phone.ilike.%${last10}%`);
    }
    if (d.length === 10) {
      parts.push(`primary_phone.ilike.%1${d}%`);
      parts.push(`secondary_phone.ilike.%1${d}%`);
    }
    if (d.length === 11 && d.startsWith("1")) {
      const national = d.slice(1);
      parts.push(`primary_phone.ilike.%${national}%`);
      parts.push(`secondary_phone.ilike.%${national}%`);
    }
  }

  return parts.join(",");
}

export function matchesLeadSearchRow(contact: CrmLeadsContactEmb | null, qRaw: string): boolean {
  if (!qRaw.trim()) return true;
  const needle = qRaw.trim().toLowerCase();
  const name = contactDisplayName(contact).toLowerCase();
  const email = contactEmail(contact).toLowerCase();
  const phoneRaw = (contact?.primary_phone ?? "").toLowerCase();
  const secondaryRaw = (contact?.secondary_phone ?? "").toLowerCase();

  if (name.includes(needle) || email.includes(needle)) return true;
  if (phoneRaw.includes(needle) || secondaryRaw.includes(needle)) return true;

  const needleDigits = searchQueryDigits(qRaw);
  if (needleDigits.length >= 7) {
    const p1 = normalizePhone(contact?.primary_phone ?? "");
    const p2 = normalizePhone(contact?.secondary_phone ?? "");
    const tail10 = needleDigits.slice(-10);
    const tail7 = needleDigits.slice(-7);
    for (const p of [p1, p2]) {
      if (!p) continue;
      if (p.includes(needleDigits)) return true;
      if (needleDigits.length >= 10 && p.includes(tail10)) return true;
      if (needleDigits.length >= 7 && p.slice(-10).includes(tail7)) return true;
    }
  }

  return false;
}
