import { normalizedPhonesEquivalent } from "@/lib/crm/incoming-caller-lookup";
import { normalizePhone } from "@/lib/phone/us-phone-format";

import type { GlobalSearchResult, ParsedGlobalSearchQuery } from "./types";

const ACTIVE_LEAD_STATUSES = new Set(["new", "contacted", "qualified", "pending", "active", "open"]);
const ACTIVE_PATIENT_STATUSES = new Set(["active", "on_hold", "pending_start"]);

function recencyBoost(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  const days = (Date.now() - t) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 40;
  if (days <= 30) return 25;
  if (days <= 90) return 10;
  return 0;
}

function exactPhoneBoost(result: GlobalSearchResult, query: ParsedGlobalSearchQuery): number {
  if (!query.isPhone || !query.digits) return 0;
  const phones = [result.phone, result.callPartyNumber].filter(Boolean) as string[];
  for (const p of phones) {
    if (normalizedPhonesEquivalent(p, query.digits)) return 1000;
  }
  return 0;
}

function exactEmailBoost(result: GlobalSearchResult, query: ParsedGlobalSearchQuery): number {
  if (!query.isEmail || !result.email) return 0;
  return result.email.trim().toLowerCase() === query.lower ? 900 : 0;
}

function exactNameBoost(result: GlobalSearchResult, query: ParsedGlobalSearchQuery): number {
  if (query.isPhone || query.isEmail) return 0;
  const title = result.title.trim().toLowerCase();
  if (title === query.lower) return 800;
  if (title.startsWith(query.lower)) return 200;
  return 0;
}

function activeEntityBoost(result: GlobalSearchResult): number {
  const status = (result.status ?? "").trim().toLowerCase();
  if (result.type === "lead" && ACTIVE_LEAD_STATUSES.has(status)) return 100;
  if (result.type === "patient" && ACTIVE_PATIENT_STATUSES.has(status)) return 100;
  if (result.type === "patient" && status.includes("active")) return 100;
  return 0;
}

function partialMatchPenalty(result: GlobalSearchResult, query: ParsedGlobalSearchQuery): number {
  if (query.isPhone || query.isEmail) return 0;
  const title = result.title.trim().toLowerCase();
  if (title.includes(query.lower)) return 0;
  return -50;
}

export function scoreGlobalSearchResult(
  result: GlobalSearchResult,
  query: ParsedGlobalSearchQuery
): number {
  let score = 0;
  score += exactPhoneBoost(result, query);
  score += exactEmailBoost(result, query);
  score += exactNameBoost(result, query);
  score += activeEntityBoost(result);
  score += recencyBoost(result.lastActivityAt ?? result.updatedAt ?? result.createdAt);
  score += partialMatchPenalty(result, query);

  if (result.type === "lead") score += 30;
  if (result.type === "patient") score += 25;
  if (result.type === "call") score += 15;

  return score;
}

export function rankGlobalSearchResults(
  results: GlobalSearchResult[],
  query: ParsedGlobalSearchQuery
): GlobalSearchResult[] {
  const scored = results.map((r) => ({
    ...r,
    rankScore: scoreGlobalSearchResult(r, query),
  }));

  scored.sort((a, b) => {
    const diff = (b.rankScore ?? 0) - (a.rankScore ?? 0);
    if (diff !== 0) return diff;
    const aTime = Date.parse(a.lastActivityAt ?? a.updatedAt ?? a.createdAt ?? "");
    const bTime = Date.parse(b.lastActivityAt ?? b.updatedAt ?? b.createdAt ?? "");
    return bTime - aTime;
  });

  return scored;
}

export function dedupeGlobalSearchResults(results: GlobalSearchResult[]): GlobalSearchResult[] {
  const seen = new Set<string>();
  const priority: Record<string, number> = {
    lead: 5,
    patient: 4,
    call: 3,
    private_pay: 3,
    conversation: 2,
    fax: 2,
    contact: 1,
  };

  const byKey = new Map<string, GlobalSearchResult>();

  for (const r of results) {
    const key = `${r.type}:${r.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, r);
      continue;
    }
    const existingPri = priority[existing.type] ?? 0;
    const newPri = priority[r.type] ?? 0;
    if (newPri > existingPri || (r.rankScore ?? 0) > (existing.rankScore ?? 0)) {
      byKey.set(key, r);
    }
  }

  const out: GlobalSearchResult[] = [];
  for (const r of results) {
    const key = `${r.type}:${r.id}`;
    if (seen.has(key)) continue;
    const kept = byKey.get(key);
    if (kept !== r) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Drop standalone contacts when a lead/patient exists for the same href contact detail. */
export function suppressRedundantContacts(results: GlobalSearchResult[]): GlobalSearchResult[] {
  const contactIdsWithEntity = new Set<string>();
  for (const r of results) {
    if (r.type === "lead" || r.type === "patient") {
      const m = r.href.match(/\/admin\/crm\/contacts\/([^/?#]+)/);
      if (m?.[1]) contactIdsWithEntity.add(m[1]);
    }
  }
  return results.filter((r) => {
    if (r.type !== "contact") return true;
    const m = r.href.match(/\/admin\/crm\/contacts\/([^/?#]+)/);
    if (!m?.[1]) return true;
    return !contactIdsWithEntity.has(m[1]);
  });
}

export function phoneDigitsMatch(stored: string | null | undefined, queryDigits: string): boolean {
  if (!stored || !queryDigits) return false;
  return normalizePhone(stored).includes(queryDigits) || normalizedPhonesEquivalent(stored, queryDigits);
}
