import "server-only";

type SupabaseReadResult<T> = { data: T | null; error: { message?: string } | null };

/**
 * Development-only timings for Supabase reads. Logs resource label, duration, and row estimate only —
 * never bodies, names, phones, emails, or tokens.
 */
export async function devTimedSupabaseQuery<T>(
  resourceLabel: string,
  run: () => PromiseLike<SupabaseReadResult<T>>
): Promise<SupabaseReadResult<T>> {
  if (process.env.NODE_ENV !== "development") {
    return run();
  }
  const t0 = Date.now();
  const res = await run();
  const ms = Date.now() - t0;
  const data = res.data as unknown;
  const rows = Array.isArray(data) ? data.length : data == null ? 0 : 1;
  const err = res.error ? " error=1" : "";
  console.info(`[db-dev] ${resourceLabel} ms=${ms} rows=${rows}${err}`);
  return res;
}
