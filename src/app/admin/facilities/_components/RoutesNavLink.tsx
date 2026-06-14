"use client";

import Link from "next/link";

const defaultCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-teal-700 bg-teal-50 px-3 py-2 text-center text-xs font-semibold text-teal-950 shadow-sm transition hover:bg-teal-100 sm:text-sm";

export function RoutesNavLink({ className = defaultCls }: { className?: string }) {
  return (
    <Link href="/admin/facilities/routes" className={className}>
      Saved Routes
    </Link>
  );
}
