/**
 * Opt-in timing for RSC routes and the workspace softphone client. Set
 * NEXT_PUBLIC_ROUTE_PERF=1 for one-line `[route-perf]` total logs.
 *
 * Set ROUTE_PERF_STEPS=1 (server) for per-step DB segment timings on instrumented routes.
 * Steps log as `[route-perf] step <name> <ms>ms` in addition to totals when totals are enabled.
 *
 * Set DEBUG_ADMIN_PERF=1 (server) for `console.time` / `console.timeEnd` on wrapped segments
 * (same labels as ROUTE_PERF_STEPS when both are on).
 */
export function routePerfEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ROUTE_PERF === "1";
}

/** Per-query / per-segment timings (server env; not required in browser bundle). */
export function routePerfStepsEnabled(): boolean {
  return process.env.ROUTE_PERF_STEPS === "1";
}

/** Enables `console.time` / `console.timeEnd` for measured admin RSC segments. */
export function adminConsolePerfEnabled(): boolean {
  return process.env.DEBUG_ADMIN_PERF === "1";
}

/** Start marker (ms since epoch); 0 when no route/total/step/admin console perf is enabled. */
export function routePerfStart(): number {
  if (!routePerfEnabled() && !routePerfStepsEnabled() && !adminConsolePerfEnabled()) return 0;
  return Date.now();
}

export function routePerfLog(segment: string, startedAtMs: number): void {
  if (!routePerfEnabled() && !routePerfStepsEnabled() && !adminConsolePerfEnabled()) return;
  if (!startedAtMs) return;
  const ms = Date.now() - startedAtMs;
  console.info(`[route-perf] ${segment} total=${ms.toFixed(0)}ms`);
}

/** One step duration (only when ROUTE_PERF_STEPS=1). */
export function routePerfStep(label: string, durationMs: number): void {
  if (!routePerfStepsEnabled()) return;
  console.info(`[route-perf] step ${label} ${durationMs.toFixed(0)}ms`);
}

export async function routePerfTimed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    routePerfStep(label, Date.now() - t0);
  }
}

/**
 * Wraps async work with optional `console.time` (DEBUG_ADMIN_PERF=1) and optional
 * `[route-perf] step` (ROUTE_PERF_STEPS=1).
 */
export async function adminPerfTimed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const useConsole = adminConsolePerfEnabled();
  const useStep = routePerfStepsEnabled();
  if (useConsole) console.time(label);
  const t0 = useStep ? Date.now() : 0;
  try {
    return await fn();
  } finally {
    if (useConsole) console.timeEnd(label);
    if (useStep && t0) routePerfStep(label, Date.now() - t0);
  }
}

export function routePerfClientMark(label: string, startedAtMs: number): void {
  if (!routePerfEnabled()) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const ms = Math.max(0, now - startedAtMs);
  console.info(`[route-perf] client ${label} ${ms.toFixed(0)}ms`);
}

/** Bottom nav: time from tap handler start to immediately after `router.push` returns (opt-in). */
export function routePerfClientNavTapToPush(startedAtPerfMs: number): void {
  if (!routePerfEnabled()) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const ms = Math.max(0, now - startedAtPerfMs);
  console.info(`[route-perf] client nav:tap→push ${ms.toFixed(1)}ms`);
}

/** Bottom nav `<Link>`: sync work in click handler through next microtask (opt-in). */
export function routePerfClientNavTapToMicrotask(startedAtPerfMs: number): void {
  if (!routePerfEnabled()) return;
  queueMicrotask(() => {
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const ms = Math.max(0, now - startedAtPerfMs);
    console.info(`[route-perf] client nav:tap→microtask ${ms.toFixed(1)}ms`);
  });
}

/** When `usePathname()` updates after a bottom-nav tap (opt-in). */
export function routePerfClientNavTapToPathnameSettled(
  startedAtPerfMs: number,
  nextPathname: string
): void {
  if (!routePerfEnabled()) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const ms = Math.max(0, now - startedAtPerfMs);
  console.info(`[route-perf] client nav:tap→pathname ${ms.toFixed(1)}ms path=${nextPathname}`);
}

/** Opt-in render counter for temporary perf triage. Enable with NEXT_PUBLIC_ROUTE_PERF=1. */
export function routePerfRenderCount(label: string): void {
  if (!routePerfEnabled()) return;
  console.count(`RENDER: ${label}`);
}
