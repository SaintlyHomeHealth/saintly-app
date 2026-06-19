import Link from "next/link";
import type { ReactNode } from "react";

import { adminPaginationBtnCls } from "./admin-design-tokens";

type Props = {
  page: number;
  totalPages: number;
  prevHref: string | null;
  nextHref: string | null;
  ariaLabel?: string;
  className?: string;
  trailing?: ReactNode;
};

export function AdminPaginationBar({
  page,
  totalPages,
  prevHref,
  nextHref,
  ariaLabel = "Pagination",
  className = "",
  trailing,
}: Props) {
  if (totalPages <= 1 && !trailing) return null;

  return (
    <nav className={`flex flex-wrap items-center gap-2 ${className}`.trim()} aria-label={ariaLabel}>
      {totalPages > 1 ? (
        <>
          {prevHref ? (
            <Link href={prevHref} prefetch={false} className={adminPaginationBtnCls}>
              Previous
            </Link>
          ) : (
            <span className={`${adminPaginationBtnCls} opacity-50`}>Previous</span>
          )}
          <span className="text-xs font-medium tabular-nums text-slate-600">
            Page {page} of {totalPages}
          </span>
          {nextHref ? (
            <Link href={nextHref} prefetch={false} className={adminPaginationBtnCls}>
              Next
            </Link>
          ) : (
            <span className={`${adminPaginationBtnCls} opacity-50`}>Next</span>
          )}
        </>
      ) : null}
      {trailing}
    </nav>
  );
}
