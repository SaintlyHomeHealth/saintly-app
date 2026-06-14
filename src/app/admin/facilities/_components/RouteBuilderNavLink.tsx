"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  FACILITY_ROUTE_DRAFT_EVENT,
  getFacilityRouteDraftCount,
} from "@/lib/crm/facility-route-draft";

type RouteBuilderNavLinkProps = {
  className?: string;
  showCount?: boolean;
};

const defaultCls =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-indigo-600 bg-indigo-50 px-3 py-2 text-center text-xs font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100 sm:text-sm";

export function RouteBuilderNavLink({
  className = defaultCls,
  showCount = true,
}: RouteBuilderNavLinkProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => setCount(getFacilityRouteDraftCount());
    refresh();
    window.addEventListener(FACILITY_ROUTE_DRAFT_EVENT, refresh);
    return () => window.removeEventListener(FACILITY_ROUTE_DRAFT_EVENT, refresh);
  }, []);

  const label = showCount ? `Route Builder (${count})` : "Route Builder";

  return (
    <Link href="/admin/facilities/route-builder" className={className}>
      {label}
    </Link>
  );
}
