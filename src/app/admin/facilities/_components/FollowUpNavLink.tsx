"use client";

import Link from "next/link";

const defaultCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-amber-600 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 sm:text-sm";

type FollowUpNavLinkProps = {
  className?: string;
};

export function FollowUpNavLink({ className = defaultCls }: FollowUpNavLinkProps) {
  return (
    <Link href="/admin/facilities/follow-ups" className={className}>
      Follow-Ups
    </Link>
  );
}
