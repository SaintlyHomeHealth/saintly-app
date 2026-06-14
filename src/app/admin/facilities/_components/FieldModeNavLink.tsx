"use client";

import Link from "next/link";

const defaultCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-emerald-700 bg-emerald-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:text-sm";

export function FieldModeNavLink({ className = defaultCls }: { className?: string }) {
  return (
    <Link href="/admin/facilities/field" className={className}>
      Field Mode
    </Link>
  );
}
