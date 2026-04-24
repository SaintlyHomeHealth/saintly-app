import "server-only";

/** Shape returned by PostgREST / Supabase on failed writes (plus optional Postgres fields). */
export type StaffInsertPostgrestError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  constraint?: string;
};

export function extractConstraintName(err: StaffInsertPostgrestError | null | undefined): string | null {
  if (!err) return null;
  const c = err.constraint;
  if (typeof c === "string" && c.trim()) return c.trim();
  const msg = err.message ?? "";
  const m1 = msg.match(/constraint\s+["']([^"']+)["']/i);
  if (m1?.[1]) return m1[1];
  const m2 = msg.match(/unique constraint\s+["']([^"']+)["']/i);
  if (m2?.[1]) return m2[1];
  return null;
}

/** Server-only logging for failed staff inserts (never surface in the UI). */
export function logStaffInsertFailure(
  context: string,
  error: StaffInsertPostgrestError | null,
  meta?: Record<string, unknown>
): void {
  console.warn(`[staff] ${context}`, {
    ...(meta ?? {}),
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    constraint: extractConstraintName(error),
  });
}
