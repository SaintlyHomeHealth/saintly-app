"use client";

import Link from "next/link";

const defaultCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-violet-600 bg-violet-50 px-3 py-2 text-center text-xs font-semibold text-violet-950 shadow-sm transition hover:bg-violet-100 sm:text-sm";

type ReferralsNavLinkProps = {
  className?: string;
};

export function ReferralsNavLink({ className = defaultCls }: ReferralsNavLinkProps) {
  return (
    <Link href="/admin/facilities/referrals" className={className}>
      Facility Referrals
    </Link>
  );
}
