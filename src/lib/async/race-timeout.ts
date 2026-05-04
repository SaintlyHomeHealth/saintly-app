/**
 * Resolve `promise` or reject after `timeoutMs` (for hot API routes — avoid platform 504s).
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<{ ok: true; value: T } | { ok: false; error: string; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout:${label}`)), timeoutMs);
  });
  try {
    const value = await Promise.race([promise, timeoutPromise]);
    return { ok: true, value: value as T };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timedOut = msg.startsWith("timeout:");
    return { ok: false, error: msg, timedOut };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
