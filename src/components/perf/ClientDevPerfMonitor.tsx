"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  installDevFetchMonitor,
  logActiveSubscriptions,
  logPageFetchSummary,
  resetPageFetchCount,
  devPerfEnabled,
} from "@/lib/perf/client-dev-perf";

export function ClientDevPerfMonitor() {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!devPerfEnabled()) return;
    installDevFetchMonitor();
  }, []);

  useEffect(() => {
    if (!devPerfEnabled()) return;
    resetPageFetchCount();
    const id = window.setTimeout(() => {
      logPageFetchSummary(pathname);
      logActiveSubscriptions();
    }, 2500);
    return () => window.clearTimeout(id);
  }, [pathname]);

  return null;
}
