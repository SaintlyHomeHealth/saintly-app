"use client";

import Link from "next/link";

const defaultCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-indigo-600 bg-indigo-50 px-3 py-2 text-center text-xs font-semibold text-indigo-950 shadow-sm transition hover:bg-indigo-100 sm:text-sm";

type AnalyticsNavLinkProps = {
  className?: string;
};

export function AnalyticsNavLink({ className = defaultCls }: AnalyticsNavLinkProps) {
  return (
    <Link href="/admin/facilities/analytics" className={className}>
      Outreach Analytics
    </Link>
  );
}
