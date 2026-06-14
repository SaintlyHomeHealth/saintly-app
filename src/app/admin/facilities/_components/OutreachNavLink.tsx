"use client";

import Link from "next/link";

const defaultCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-teal-600 bg-teal-50 px-3 py-2 text-center text-xs font-semibold text-teal-900 shadow-sm transition hover:bg-teal-100 sm:text-sm";

type OutreachNavLinkProps = {
  className?: string;
};

export function OutreachNavLink({ className = defaultCls }: OutreachNavLinkProps) {
  return (
    <Link href="/admin/facilities/outreach" className={className}>
      Today&apos;s Outreach
    </Link>
  );
}
