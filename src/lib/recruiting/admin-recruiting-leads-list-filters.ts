import {
  recruitingLeadSourceBadge,
  type RecruitingLeadSourceBadge,
} from "@/lib/recruiting/recruiting-lead-source-display";
import {
  isRecruitingLeadRoleBadge,
  recruitingLeadRoleBadge,
  type RecruitingLeadRoleBadge,
} from "@/lib/recruiting/recruiting-lead-role-display";

export type AdminRecruitingLeadsSourceFilter =
  | ""
  | "facebook"
  | "website"
  | "manual_resume_upload"
  | "legacy_crm_lead";

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

const SOURCE_FILTER_TO_BADGE: Record<
  Exclude<AdminRecruitingLeadsSourceFilter, "">,
  RecruitingLeadSourceBadge
> = {
  facebook: "Facebook",
  website: "Website Careers",
  manual_resume_upload: "Manual Resume Upload",
  legacy_crm_lead: "Legacy CRM Lead",
};

export function parseAdminRecruitingLeadsListSearchParams(
  rawSp: Record<string, string | string[] | undefined>
): AdminRecruitingLeadsListFilters {
  const roleRaw = one(rawSp, "role");
  const role = isRecruitingLeadRoleBadge(roleRaw) ? roleRaw : "";
  return {
    q: one(rawSp, "q"),
    status: one(rawSp, "status"),
    coverageArea: one(rawSp, "coverage"),
    source: parseSourceFilter(one(rawSp, "source")),
    role,
    startDate: one(rawSp, "start"),
  };
}

export function buildAdminRecruitingLeadsListHref(
  filters: Partial<AdminRecruitingLeadsListFilters>
): string {
  const u = new URLSearchParams();
  if (filters.q) u.set("q", filters.q);
  if (filters.status) u.set("status", filters.status);
  if (filters.coverageArea) u.set("coverage", filters.coverageArea);
  if (filters.source) u.set("source", filters.source);
  if (filters.role) u.set("role", filters.role);
  if (filters.startDate) u.set("start", filters.startDate);
  const s = u.toString();
  return s ? `/admin/recruiting-leads?${s}` : "/admin/recruiting-leads";
}

export function buildAdminRecruitingLeadDetailHref(
  leadId: string,
  filters: Partial<AdminRecruitingLeadsListFilters>
): string {
  const listHref = buildAdminRecruitingLeadsListHref(filters);
  const suffix = listHref.replace("/admin/recruiting-leads", "");
  return `/admin/recruiting-leads/${leadId}${suffix}`;
}

type RecruitingLeadsListQuery = {
  eq: (col: string, val: string) => RecruitingLeadsListQuery;
  ilike: (col: string, val: string) => RecruitingLeadsListQuery;
  or: (filters: string) => RecruitingLeadsListQuery;
};

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

  return q;
}

type RecruitingLeadListFilterRow = {
  source: string | null;
  form_name: string | null;
  raw_payload: unknown;
  license_status: string | null;
  lead_type: string | null;
};

export function matchesAdminRecruitingLeadsSourceFilter(
  row: RecruitingLeadListFilterRow,
  source: AdminRecruitingLeadsSourceFilter
): boolean {
  if (!source) return true;
  const badge = recruitingLeadSourceBadge({
    source: row.source,
    form_name: row.form_name,
    raw_payload: row.raw_payload,
  });
  return badge === SOURCE_FILTER_TO_BADGE[source];
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

export function applyAdminRecruitingLeadsClientFilters<
  T extends RecruitingLeadListFilterRow,
>(rows: T[], filters: AdminRecruitingLeadsListFilters): T[] {
  return rows.filter(
    (row) =>
      matchesAdminRecruitingLeadsSourceFilter(row, filters.source) &&
      matchesAdminRecruitingLeadsRoleFilter(row, filters.role)
  );
}
