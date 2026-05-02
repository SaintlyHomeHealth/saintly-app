import type { SupabaseClient } from "@supabase/supabase-js";

import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { escapeForIlike } from "@/lib/crm/crm-leads-search";
import { normalizePhone } from "@/lib/phone/us-phone-format";

export type ContactDuplicateLite = {
  id: string;
  primary_phone: string | null;
  email: string | null;
  full_name?: string | null;
  organization_name?: string | null;
};

/** Lowercase trimmed email, or null when empty / not duplicate-relevant. */
export function normalizeContactEmailForDedupe(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  return t === "" ? null : t;
}

/** Digit-only phone for comparison (10+ digits meaningful). */
export function normalizeContactPrimaryPhoneForDedupe(raw: string | null | undefined): string | null {
  const d = normalizePhone(raw ?? "");
  if (d.length < 10) return null;
  return d;
}

export type DuplicateMatchReason = "phone" | "email";

export type ContactDuplicateFlags = {
  duplicateByPhone: boolean;
  duplicateByEmail: boolean;
  reasons: DuplicateMatchReason[];
};

/**
 * Within a loaded batch (e.g. directory query), flags contacts whose **primary phone** (digits) or **email**
 * (lowercase trim) matches at least one **other** row in the same batch.
 */
export function buildDuplicateFlagsForBatch<T extends ContactDuplicateLite>(rows: T[]): Map<string, ContactDuplicateFlags> {
  const phoneToIds = new Map<string, string[]>();
  const emailToIds = new Map<string, string[]>();

  for (const r of rows) {
    const p = normalizeContactPrimaryPhoneForDedupe(r.primary_phone);
    if (p) {
      const arr = phoneToIds.get(p) ?? [];
      arr.push(r.id);
      phoneToIds.set(p, arr);
    }
    const e = normalizeContactEmailForDedupe(r.email);
    if (e) {
      const arr = emailToIds.get(e) ?? [];
      arr.push(r.id);
      emailToIds.set(e, arr);
    }
  }

  const out = new Map<string, ContactDuplicateFlags>();
  for (const r of rows) {
    const p = normalizeContactPrimaryPhoneForDedupe(r.primary_phone);
    const e = normalizeContactEmailForDedupe(r.email);
    const dupPhone = p ? (phoneToIds.get(p)?.length ?? 0) > 1 : false;
    const dupEmail = e ? (emailToIds.get(e)?.length ?? 0) > 1 : false;
    const reasons: DuplicateMatchReason[] = [];
    if (dupPhone) reasons.push("phone");
    if (dupEmail) reasons.push("email");
    out.set(r.id, { duplicateByPhone: dupPhone, duplicateByEmail: dupEmail, reasons });
  }
  return out;
}

export type DuplicateCandidate = {
  id: string;
  label: string;
  matchedBy: DuplicateMatchReason[];
};

const DUPLICATE_POOL_SELECT = "id, primary_phone, email, full_name, organization_name";

/**
 * Loads only contacts that might match **primary phone digits** or **email** (case-insensitive),
 * instead of scanning thousands of unrelated rows. `findDuplicateCandidatesForContact` still
 * applies strict normalized equality so conservative matching is preserved.
 */
export async function fetchContactDuplicateMatchPool(
  supabase: SupabaseClient,
  excludeContactId: string,
  row: ContactDuplicateLite
): Promise<ContactDuplicateLite[]> {
  const curP = normalizeContactPrimaryPhoneForDedupe(row.primary_phone);
  const curE = normalizeContactEmailForDedupe(row.email);
  if (!curP && !curE) return [];

  const byId = new Map<string, ContactDuplicateLite>();

  const ingest = (rows: ContactDuplicateLite[] | null | undefined) => {
    for (const r of rows ?? []) {
      if (!r?.id || r.id === excludeContactId) continue;
      byId.set(r.id, r);
    }
  };

  const tasks: Promise<{ data: unknown }>[] = [];

  if (curE) {
    const esc = escapeForIlike(curE);
    tasks.push(
      contactRowsActiveOnly(
        supabase.from("contacts").select(DUPLICATE_POOL_SELECT).neq("id", excludeContactId).ilike("email", esc)
      ).limit(200)
    );
  }

  if (curP && curP.length >= 10) {
    const tail10 = curP.slice(-10);
    const escDigits = escapeForIlike(tail10);
    tasks.push(
      contactRowsActiveOnly(
        supabase
          .from("contacts")
          .select(DUPLICATE_POOL_SELECT)
          .neq("id", excludeContactId)
          .ilike("primary_phone", `%${escDigits}%`)
      ).limit(500)
    );
  }

  const results = await Promise.all(tasks);
  for (const res of results) {
    ingest(res.data as ContactDuplicateLite[] | null);
  }

  return [...byId.values()];
}

/**
 * Candidates outside the current contact: same normalized **primary** phone and/or **email**.
 * Pool is pre-loaded (targeted queries or capped batch); matching is in-memory.
 */
export function findDuplicateCandidatesForContact(
  current: ContactDuplicateLite,
  pool: ContactDuplicateLite[]
): DuplicateCandidate[] {
  const curP = normalizeContactPrimaryPhoneForDedupe(current.primary_phone);
  const curE = normalizeContactEmailForDedupe(current.email);
  if (!curP && !curE) return [];

  const candidates: DuplicateCandidate[] = [];
  for (const o of pool) {
    if (o.id === current.id) continue;
    const matchedBy: DuplicateMatchReason[] = [];
    const op = normalizeContactPrimaryPhoneForDedupe(o.primary_phone);
    const oe = normalizeContactEmailForDedupe(o.email);
    if (curP && op && curP === op) matchedBy.push("phone");
    if (curE && oe && curE === oe) matchedBy.push("email");
    if (matchedBy.length === 0) continue;
    const org = (o.organization_name ?? "").trim();
    const fn = (o.full_name ?? "").trim();
    const label = org || fn || o.id.slice(0, 8) + "…";
    candidates.push({ id: o.id, label, matchedBy });
  }
  return candidates;
}
