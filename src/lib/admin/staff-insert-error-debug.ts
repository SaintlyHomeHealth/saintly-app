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

const MAX_QUERY_VALUE_LEN = 480;

function qPart(key: string, val: string | null | undefined): string | null {
  if (val == null) return null;
  const s0 = String(val);
  if (s0.trim() === "") return null;
  const s = s0.length > MAX_QUERY_VALUE_LEN ? `${s0.slice(0, MAX_QUERY_VALUE_LEN - 1)}…` : s0;
  return `${key}=${encodeURIComponent(s)}`;
}

/**
 * Safe, truncated query segment for redirect after failed insert (append to `?err=insert`).
 */
export function staffInsertFailureQueryParams(
  error: StaffInsertPostgrestError | null,
  opts?: { emptyRow?: boolean }
): string {
  const parts: string[] = [];
  if (opts?.emptyRow) {
    parts.push("insEmpty=1");
  }
  if (!error) {
    if (!opts?.emptyRow) {
      parts.push(
        "insNote=" + encodeURIComponent("No error object from Supabase on failed insert (unexpected).")
      );
    }
    return parts.length ? `&${parts.join("&")}` : "";
  }

  const code = qPart("insCode", error.code);
  const msg = qPart("insMsg", error.message);
  const det = qPart("insDetails", error.details ?? undefined);
  const hint = qPart("insHint", error.hint ?? undefined);
  const cons = qPart("insConstraint", extractConstraintName(error) ?? undefined);
  for (const p of [code, msg, det, hint, cons]) {
    if (p) parts.push(p);
  }
  return parts.length ? `&${parts.join("&")}` : "";
}

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
