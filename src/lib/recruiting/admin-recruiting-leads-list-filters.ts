export type AdminRecruitingLeadsListFilters = {
  q: string;
  status: string;
  coverageArea: string;
  licenseStatus: string;
};

function one(raw: Record<string, string | string[] | undefined>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.trim() : Array.isArray(v) ? String(v[0] ?? "").trim() : "";
}

export function parseAdminRecruitingLeadsListSearchParams(
  rawSp: Record<string, string | string[] | undefined>
): AdminRecruitingLeadsListFilters {
  return {
    q: one(rawSp, "q"),
    status: one(rawSp, "status"),
    coverageArea: one(rawSp, "coverage"),
    licenseStatus: one(rawSp, "license"),
  };
}

type RecruitingLeadsListQuery = {
  eq: (col: string, val: string) => RecruitingLeadsListQuery;
  ilike: (col: string, val: string) => RecruitingLeadsListQuery;
  or: (filters: string) => RecruitingLeadsListQuery;
};

export function attachAdminRecruitingLeadsListPredicates(qb: unknown, filters: AdminRecruitingLeadsListFilters): unknown {
  let q = qb as RecruitingLeadsListQuery;

  if (filters.status) {
    q = q.eq("status", filters.status);
  }
  if (filters.coverageArea) {
    q = q.ilike("coverage_area", `%${filters.coverageArea}%`);
  }
  if (filters.licenseStatus) {
    q = q.ilike("license_status", `%${filters.licenseStatus}%`);
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
