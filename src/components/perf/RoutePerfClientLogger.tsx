"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { routePerfClientMark, routePerfEnabled } from "@/lib/perf/route-perf";

function routeKey(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

export function RoutePerfClientLogger() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const currentKey = routeKey(pathname, search);
  const previousKeyRef = useRef<string | null>(null);
  const transitionStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!routePerfEnabled()) return;
    const previousKey = previousKeyRef.current;
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    if (transitionStartedAtRef.current == null) {
      transitionStartedAtRef.current = now;
    }

    if (previousKey == null) {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const initialStartedAt = nav ? 0 : transitionStartedAtRef.current;
      routePerfClientMark(`initial ${currentKey}`, initialStartedAt);
    } else if (previousKey !== currentKey) {
      routePerfClientMark(`${previousKey} -> ${currentKey}`, transitionStartedAtRef.current);
    }

    previousKeyRef.current = currentKey;
    transitionStartedAtRef.current = now;
  }, [currentKey]);

  return null;
}
