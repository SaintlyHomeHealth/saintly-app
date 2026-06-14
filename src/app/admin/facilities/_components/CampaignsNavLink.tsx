"use client";

import Link from "next/link";

const defaultCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-pink-600 bg-pink-50 px-3 py-2 text-center text-xs font-semibold text-pink-950 shadow-sm transition hover:bg-pink-100 sm:text-sm";

export function CampaignsNavLink({ className = defaultCls }: { className?: string }) {
  return (
    <Link href="/admin/facilities/campaigns" className={className}>
      Campaigns
    </Link>
  );
}
