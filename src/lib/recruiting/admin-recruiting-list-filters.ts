/**
 * Shared filters for `/admin/recruiting` list + exports (keep query logic in sync).
 */

import { escapeForIlike } from "@/lib/crm/crm-leads-search";
import { phoenixEndOfTodayIso, phoenixYmdEndIso, phoenixYmdStartIso } from "@/lib/recruiting/phoenix-time";

export type AdminRecruitingListFilters = {
  status: string;
  discipline: string;
  area: string;
  city: string;
  coverage: string;
  name: string;
  source: string;
  followUp: string;
  interest: string;
  tags: string;
  lastContactFrom: string;
  lastContactTo: string;
};

export function parseAdminRecruitingListSearchParams(raw: Record<string, string | string[] | undefined>): AdminRecruitingListFilters {
  const one = (k: string) => {
    const v = raw[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
  };

  return {
    status: one("status").trim(),
    discipline: one("discipline").trim(),
    area: one("area").trim(),
    city: one("city").trim(),
    coverage: one("coverage").trim(),
    name: one("name").trim(),
    source: one("source").trim(),
    followUp: one("followUp").trim(),
    interest: one("interest").trim(),
    tags: one("tags").trim(),
    lastContactFrom: one("lastContactFrom").trim(),
    lastContactTo: one("lastContactTo").trim(),
  };
}

/** Chained filter surface (explicit return type avoids `unknown` reassignment errors). */
type RecruitingCandidatesFilterQuery = {
  eq(c: string, v: unknown): RecruitingCandidatesFilterQuery;
  or(expr: string): RecruitingCandidatesFilterQuery;
  ilike(c: string, pat: string): RecruitingCandidatesFilterQuery;
  gte(c: string, v: string): RecruitingCandidatesFilterQuery;
  lte(c: string, v: string): RecruitingCandidatesFilterQuery;
  not(c: string, op: string, v: unknown): RecruitingCandidatesFilterQuery;
};

/**
 * Apply URL-driven filters shared by row selects + exports.
 * Return type is loose so Supabase builder generics do not recurse (TS2589).
 */
export function attachAdminRecruitingListPredicates(qb: unknown, f: AdminRecruitingListFilters): unknown {
  let q = qb as RecruitingCandidatesFilterQuery;

  if (f.status) q = q.eq("status", f.status);
  if (f.discipline) q = q.eq("discipline", f.discipline);
  if (f.name) {
    const esc = escapeForIlike(f.name);
    const pattern = `%${esc}%`;
    q = q.or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  }
  if (f.source) q = q.eq("source", f.source);
  if (f.interest) q = q.eq("interest_level", f.interest);
  if (f.tags) q = q.ilike("recruiting_tags", `%${f.tags}%`);
  if (f.city) q = q.ilike("city", `%${f.city}%`);
  if (f.coverage) q = q.ilike("coverage_area", `%${f.coverage}%`);
  if (!f.city && !f.coverage && f.area) {
    const a = `%${f.area}%`;
    q = q.or(`coverage_area.ilike.${a},city.ilike.${a}`);
  }
  if (f.lastContactFrom) {
    const iso = phoenixYmdStartIso(f.lastContactFrom);
    if (iso) q = q.gte("last_contact_at", iso);
  }
  if (f.lastContactTo) {
    const iso = phoenixYmdEndIso(f.lastContactTo);
    if (iso) q = q.lte("last_contact_at", iso);
  }
  if (f.followUp === "due") {
    const end = phoenixEndOfTodayIso();
    q = q.not("next_follow_up_at", "is", null).lte("next_follow_up_at", end);
  }

  return q;
}
