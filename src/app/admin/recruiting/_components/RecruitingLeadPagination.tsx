import Link from "next/link";

import {
  buildAdminRecruitingLeadsListHref,
  type AdminRecruitingLeadsListFilters,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";

type Props = {
  filters: AdminRecruitingLeadsListFilters;
  page: number;
  totalPages: number;
};

const btnCls =
  "inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export function RecruitingLeadPagination({ filters, page, totalPages }: Props) {
  if (totalPages <= 1) return null;

  const prevHref =
    page > 1 ? buildAdminRecruitingLeadsListHref({ ...filters, page: page - 1 }) : null;
  const nextHref =
    page < totalPages ? buildAdminRecruitingLeadsListHref({ ...filters, page: page + 1 }) : null;

  return (
    <nav className="flex items-center gap-2" aria-label="Recruiting leads pagination">
      {prevHref ? (
        <Link href={prevHref} className={btnCls}>
          Previous
        </Link>
      ) : (
        <span className={`${btnCls} opacity-50`}>Previous</span>
      )}
      <span className="text-xs font-medium tabular-nums text-slate-600">
        Page {page} of {totalPages}
      </span>
      {nextHref ? (
        <Link href={nextHref} className={btnCls}>
          Next
        </Link>
      ) : (
        <span className={`${btnCls} opacity-50`}>Next</span>
      )}
    </nav>
  );
}
