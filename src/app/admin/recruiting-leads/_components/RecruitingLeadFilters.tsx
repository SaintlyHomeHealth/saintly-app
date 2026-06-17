import Link from "next/link";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  ADMIN_RECRUITING_LEADS_SOURCE_FILTER_OPTIONS,
  type AdminRecruitingLeadsListFilters,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";
import { FACEBOOK_RECRUITING_LEAD_STATUS_OPTIONS } from "@/lib/recruiting/facebook-recruiting-lead-options";
import { RECRUITING_LEAD_ROLE_FILTER_OPTIONS } from "@/lib/recruiting/recruiting-lead-role-display";

type Props = {
  filters: AdminRecruitingLeadsListFilters;
  coverageOptions: string[];
};

const filterCardCls =
  "rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm shadow-slate-200/40";

const filterLabelCls = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export function RecruitingLeadFilters({ filters, coverageOptions }: Props) {
  return (
    <form method="get" action="/admin/recruiting-leads" className={filterCardCls}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="flex flex-col gap-1.5">
          <span className={filterLabelCls}>Search</span>
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Name, phone, or email…"
            className={crmFilterInputCls}
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={filterLabelCls}>Status</span>
          <select name="status" defaultValue={filters.status} className={crmFilterInputCls}>
            <option value="">All</option>
            {FACEBOOK_RECRUITING_LEAD_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={filterLabelCls}>Source</span>
          <select name="source" defaultValue={filters.source} className={crmFilterInputCls}>
            {ADMIN_RECRUITING_LEADS_SOURCE_FILTER_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={filterLabelCls}>Role / license</span>
          <select name="role" defaultValue={filters.role} className={crmFilterInputCls}>
            <option value="">All</option>
            {RECRUITING_LEAD_ROLE_FILTER_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={filterLabelCls}>Coverage area</span>
          <input
            name="coverage"
            list="recruiting-leads-coverage-options"
            defaultValue={filters.coverageArea}
            placeholder="Area or region…"
            className={crmFilterInputCls}
          />
          <datalist id="recruiting-leads-coverage-options">
            {coverageOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={filterLabelCls}>Start / availability</span>
          <input
            name="start"
            defaultValue={filters.startDate}
            placeholder="e.g. ASAP, June 2026…"
            className={crmFilterInputCls}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" className={crmPrimaryCtaCls}>
          Apply filters
        </button>
        <Link
          href="/admin/recruiting-leads"
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}
