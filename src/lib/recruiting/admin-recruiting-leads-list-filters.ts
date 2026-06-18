import {
  isPhoenixSameCalendarDay,
  phoenixStartOfTodayIso,
} from "@/lib/recruiting/phoenix-time";
import {
  recruitingLeadSourceBadge,
  type RecruitingLeadSourceBadge,
} from "@/lib/recruiting/recruiting-lead-source-display";
import {
  isRecruitingLeadRoleBadge,
  recruitingLeadRoleBadge,
  type RecruitingLeadRoleBadge,
} from "@/lib/recruiting/recruiting-lead-role-display";

export type AdminRecruitingLeadsTab =
  | "all"
  | "form_facebook"
  | "resume_uploads"
  | "new_today";

export type AdminRecruitingLeadsDateRange = "" | "today" | "last_7_days" | "all_time";

export type AdminRecruitingLeadsSourceFilter =
  | ""
  | "facebook"
  | "website"
  | "manual_resume_upload"
  | "legacy_crm_lead";

export const ADMIN_RECRUITING_LEADS_TAB_OPTIONS: Array<{
  value: AdminRecruitingLeadsTab;
  label: string;
}> = [
  { value: "all", label: "All Leads" },
  { value: "form_facebook", label: "Form / Facebook Leads" },
  { value: "resume_uploads", label: "Resume Uploads" },
  { value: "new_today", label: "New Today" },
];

export const ADMIN_RECRUITING_LEADS_DATE_RANGE_OPTIONS: Array<{
  value: AdminRecruitingLeadsDateRange;
  label: string;
}> = [
  { value: "", label: "All time" },
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
];

export const ADMIN_RECRUITING_LEADS_SOURCE_FILTER_OPTIONS: Array<{
  value: AdminRecruitingLeadsSourceFilter;
  label: string;
}> = [
  { value: "", label: "All" },
  { value: "facebook", label: "Facebook" },
  { value: "website", label: "Website Careers" },
  { value: "manual_resume_upload", label: "Manual Resume Upload" },
  { value: "legacy_crm_lead", label: "Legacy CRM Lead" },
];

export type AdminRecruitingLeadsListFilters = {
  q: string;
  status: string;
  coverageArea: string;
  source: AdminRecruitingLeadsSourceFilter;
  role: RecruitingLeadRoleBadge | "";
  startDate: string;
  tab: AdminRecruitingLeadsTab;
  dateRange: AdminRecruitingLeadsDateRange;
};

function one(raw: Record<string, string | string[] | undefined>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.trim() : Array.isArray(v) ? String(v[0] ?? "").trim() : "";
}

function parseSourceFilter(raw: string): AdminRecruitingLeadsSourceFilter {
  if (
    raw === "facebook" ||
    raw === "website" ||
    raw === "manual_resume_upload" ||
    raw === "legacy_crm_lead"
  ) {
    return raw;
  }
  return "";
}

function parseTabFilter(raw: string): AdminRecruitingLeadsTab {
  if (raw === "form_facebook" || raw === "resume_uploads" || raw === "new_today") {
    return raw;
  }
  return "all";
}

function parseDateRangeFilter(raw: string): AdminRecruitingLeadsDateRange {
  if (raw === "today" || raw === "last_7_days" || raw === "all_time") {
    return raw;
  }
  return "";
}

const SOURCE_FILTER_TO_BADGE: Record<
  Exclude<AdminRecruitingLeadsSourceFilter, "">,
  RecruitingLeadSourceBadge
> = {
  facebook: "Facebook",
  website: "Website Careers",
  manual_resume_upload: "Manual Resume Upload",
  legacy_crm_lead: "Legacy CRM Lead",
};

const FORM_FACEBOOK_BADGES: RecruitingLeadSourceBadge[] = ["Facebook", "Website Careers"];

export function parseAdminRecruitingLeadsListSearchParams(
  rawSp: Record<string, string | string[] | undefined>
): AdminRecruitingLeadsListFilters {
  const roleRaw = one(rawSp, "role");
  const role = isRecruitingLeadRoleBadge(roleRaw) ? roleRaw : "";
  const tab = parseTabFilter(one(rawSp, "tab"));
  let dateRange = parseDateRangeFilter(one(rawSp, "dateRange"));
  if (tab === "new_today" && !dateRange) {
    dateRange = "today";
  }
  return {
    q: one(rawSp, "q"),
    status: one(rawSp, "status"),
    coverageArea: one(rawSp, "coverage"),
    source: parseSourceFilter(one(rawSp, "source")),
    role,
    startDate: one(rawSp, "start"),
    tab,
    dateRange,
  };
}

export function buildAdminRecruitingLeadsListHref(
  filters: Partial<AdminRecruitingLeadsListFilters>
): string {
  const u = new URLSearchParams();
  if (filters.tab && filters.tab !== "all") u.set("tab", filters.tab);
  if (filters.dateRange) u.set("dateRange", filters.dateRange);
  if (filters.q) u.set("q", filters.q);
  if (filters.status) u.set("status", filters.status);
  if (filters.coverageArea) u.set("coverage", filters.coverageArea);
  if (filters.source) u.set("source", filters.source);
  if (filters.role) u.set("role", filters.role);
  if (filters.startDate) u.set("start", filters.startDate);
  const s = u.toString();
  return s ? `/admin/recruiting?${s}` : "/admin/recruiting";
}

export function buildAdminRecruitingLeadDetailHref(
  leadId: string,
  filters: Partial<AdminRecruitingLeadsListFilters>
): string {
  const listHref = buildAdminRecruitingLeadsListHref(filters);
  const suffix = listHref.replace("/admin/recruiting", "");
  return `/admin/recruiting/leads/${leadId}${suffix}`;
}

type RecruitingLeadsListQuery = {
  eq: (col: string, val: string) => RecruitingLeadsListQuery;
  ilike: (col: string, val: string) => RecruitingLeadsListQuery;
  or: (filters: string) => RecruitingLeadsListQuery;
  gte: (col: string, val: string) => RecruitingLeadsListQuery;
};

function effectiveDateRange(filters: AdminRecruitingLeadsListFilters): AdminRecruitingLeadsDateRange {
  if (filters.tab === "new_today") return "today";
  return filters.dateRange;
}

export function phoenixLast7DaysStartIso(d = new Date()): string {
  const startToday = phoenixStartOfTodayIso(d);
  const ms = Date.parse(startToday);
  if (!Number.isFinite(ms)) return startToday;
  return new Date(ms - 6 * 24 * 60 * 60 * 1000).toISOString();
}

export function attachAdminRecruitingLeadsListPredicates(
  qb: unknown,
  filters: AdminRecruitingLeadsListFilters
): unknown {
  let q = qb as RecruitingLeadsListQuery;

  if (filters.status) {
    q = q.eq("status", filters.status);
  }
  if (filters.coverageArea) {
    q = q.ilike("coverage_area", `%${filters.coverageArea}%`);
  }
  if (filters.startDate) {
    q = q.ilike("start_date", `%${filters.startDate}%`);
  }
  if (filters.q) {
    const term = filters.q.replace(/[%_]/g, "");
    if (term) {
      q = q.or(
        `full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,normalized_phone.ilike.%${term}%`
      );
    }
  }

  const range = effectiveDateRange(filters);
  if (range === "today") {
    q = q.gte("created_at", phoenixStartOfTodayIso());
  } else if (range === "last_7_days") {
    q = q.gte("created_at", phoenixLast7DaysStartIso());
  }

  return q;
}

type RecruitingLeadListFilterRow = {
  source: string | null;
  form_name: string | null;
  raw_payload: unknown;
  license_status: string | null;
  lead_type: string | null;
  created_at?: string;
};

export function recruitingLeadSourceBadgeForRow(row: RecruitingLeadListFilterRow): RecruitingLeadSourceBadge {
  return recruitingLeadSourceBadge({
    source: row.source,
    form_name: row.form_name,
    raw_payload: row.raw_payload,
  });
}

export function matchesAdminRecruitingLeadsSourceFilter(
  row: RecruitingLeadListFilterRow,
  source: AdminRecruitingLeadsSourceFilter
): boolean {
  if (!source) return true;
  return recruitingLeadSourceBadgeForRow(row) === SOURCE_FILTER_TO_BADGE[source];
}

export function matchesAdminRecruitingLeadsRoleFilter(
  row: RecruitingLeadListFilterRow,
  role: RecruitingLeadRoleBadge | ""
): boolean {
  if (!role) return true;
  return recruitingLeadRoleBadge({
    license_status: row.license_status,
    lead_type: row.lead_type,
    form_name: row.form_name,
  }) === role;
}

export function matchesAdminRecruitingLeadsTabFilter(
  row: RecruitingLeadListFilterRow,
  tab: AdminRecruitingLeadsTab
): boolean {
  if (tab === "all") return true;
  const badge = recruitingLeadSourceBadgeForRow(row);
  if (tab === "form_facebook") {
    return FORM_FACEBOOK_BADGES.includes(badge);
  }
  if (tab === "resume_uploads") {
    return badge === "Manual Resume Upload";
  }
  if (tab === "new_today") {
    return isPhoenixSameCalendarDay(row.created_at);
  }
  return true;
}

export function matchesAdminRecruitingLeadsDateRangeFilter(
  row: RecruitingLeadListFilterRow,
  dateRange: AdminRecruitingLeadsDateRange,
  tab: AdminRecruitingLeadsTab
): boolean {
  const range = tab === "new_today" ? "today" : dateRange;
  if (!range || range === "all_time") return true;
  if (!row.created_at) return false;
  if (range === "today") {
    return isPhoenixSameCalendarDay(row.created_at);
  }
  if (range === "last_7_days") {
    const t = Date.parse(row.created_at);
    const start = Date.parse(phoenixLast7DaysStartIso());
    return Number.isFinite(t) && Number.isFinite(start) && t >= start;
  }
  return true;
}

export function applyAdminRecruitingLeadsClientFilters<
  T extends RecruitingLeadListFilterRow,
>(rows: T[], filters: AdminRecruitingLeadsListFilters): T[] {
  return rows.filter(
    (row) =>
      matchesAdminRecruitingLeadsSourceFilter(row, filters.source) &&
      matchesAdminRecruitingLeadsRoleFilter(row, filters.role) &&
      matchesAdminRecruitingLeadsTabFilter(row, filters.tab) &&
      matchesAdminRecruitingLeadsDateRangeFilter(row, filters.dateRange, filters.tab)
  );
}

/** @deprecated Use buildAdminRecruitingLeadsListHref — kept for redirect compatibility */
export function legacyRecruitingLeadsListHref(
  filters: Partial<AdminRecruitingLeadsListFilters>
): string {
  return buildAdminRecruitingLeadsListHref(filters).replace(
    "/admin/recruiting",
    "/admin/recruiting-leads"
  );
}
