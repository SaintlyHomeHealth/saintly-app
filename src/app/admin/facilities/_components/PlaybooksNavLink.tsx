"use client";

import Link from "next/link";

const defaultCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-fuchsia-600 bg-fuchsia-50 px-3 py-2 text-center text-xs font-semibold text-fuchsia-950 shadow-sm transition hover:bg-fuchsia-100 sm:text-sm";

export function PlaybooksNavLink({ className = defaultCls }: { className?: string }) {
  return (
    <Link href="/admin/facilities/playbooks" className={className}>
      Playbooks
    </Link>
  );
}
