import Link from "next/link";

import {
  ADMIN_RECRUITING_LEADS_TAB_OPTIONS,
  buildAdminRecruitingLeadsListHref,
  type AdminRecruitingLeadsListFilters,
  type AdminRecruitingLeadsTab,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";

type TabCounts = Partial<Record<AdminRecruitingLeadsTab, number>>;

type Props = {
  filters: AdminRecruitingLeadsListFilters;
  counts?: TabCounts;
};

const tabBarCls =
  "flex flex-wrap gap-1 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-sm shadow-slate-200/40";

function tabCls(active: boolean): string {
  const base =
    "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition";
  if (active) {
    return `${base} bg-sky-600 text-white shadow-sm shadow-sky-200/60`;
  }
  return `${base} text-slate-600 hover:bg-sky-50 hover:text-sky-900`;
}

export function RecruitingWorkspaceTabs({ filters, counts }: Props) {
  return (
    <nav className={tabBarCls} aria-label="Recruiting lead tabs">
      {ADMIN_RECRUITING_LEADS_TAB_OPTIONS.map((option) => {
        const active = filters.tab === option.value;
        const href = buildAdminRecruitingLeadsListHref({
          ...filters,
          tab: option.value,
          dateRange: option.value === "new_today" ? "today" : filters.dateRange,
          page: 1,
        });
        const count = counts?.[option.value];
        return (
          <Link key={option.value} href={href} className={tabCls(active)} aria-current={active ? "page" : undefined}>
            {option.label}
            {typeof count === "number" ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
