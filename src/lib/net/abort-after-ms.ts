/**
 * AbortSignal.timeout is not available on every deployed Node / browser runtime.
 * Use this for bounded fetch / Supabase client calls.
 */
export function abortAfterMs(ms: number): { signal: AbortSignal; cancel: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => {
    c.abort();
  }, ms);
  return {
    signal: c.signal,
    cancel: () => clearTimeout(t),
  };
}
