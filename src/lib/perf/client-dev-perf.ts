import { routePerfEnabled } from "@/lib/perf/route-perf";

let pageFetchCount = 0;
let activeSubscriptionCount = 0;

export function devPerfEnabled(): boolean {
  return process.env.NODE_ENV === "development" || routePerfEnabled();
}

export function resetPageFetchCount(): void {
  pageFetchCount = 0;
}

export function incrementPageFetchCount(url: string, startedAtMs: number): void {
  if (!devPerfEnabled()) return;
  pageFetchCount += 1;
  const ms = Date.now() - startedAtMs;
  const path = url.startsWith("/") ? url : (() => {
    try {
      return new URL(url, "http://local").pathname;
    } catch {
      return url;
    }
  })();
  console.info(`[perf-dev] fetch #${pageFetchCount} ${path} ${ms}ms`);
}

export function logPageFetchSummary(pathname: string): void {
  if (!devPerfEnabled()) return;
  console.info(`[perf-dev] page=${pathname} totalApiFetches=${pageFetchCount}`);
}

export function trackSubscription(label: string, delta: 1 | -1): void {
  if (!devPerfEnabled()) return;
  activeSubscriptionCount = Math.max(0, activeSubscriptionCount + delta);
  console.info(`[perf-dev] subscription ${delta > 0 ? "+" : "-"}${label} active=${activeSubscriptionCount}`);
}

export function logActiveSubscriptions(): void {
  if (!devPerfEnabled()) return;
  console.info(`[perf-dev] activeSubscriptions=${activeSubscriptionCount}`);
}

/** Patches window.fetch once to count same-origin API calls in dev / when route perf is on. */
export function installDevFetchMonitor(): void {
  if (!devPerfEnabled() || typeof window === "undefined") return;
  const w = window as Window & { __saintlyFetchMonitorInstalled?: boolean };
  if (w.__saintlyFetchMonitorInstalled) return;
  w.__saintlyFetchMonitorInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const isApi =
      url.startsWith("/api/") ||
      (typeof window !== "undefined" && url.includes(`${window.location.origin}/api/`));
    const t0 = isApi ? Date.now() : 0;
    try {
      return await originalFetch(input, init);
    } finally {
      if (isApi && t0) incrementPageFetchCount(url, t0);
    }
  };
}
