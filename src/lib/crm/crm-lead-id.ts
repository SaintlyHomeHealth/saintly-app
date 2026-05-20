/** RFC-4122 UUID v1–v5 (Postgres `uuid` column). */
export const CRM_LEAD_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidCrmLeadId(v: string | null | undefined): boolean {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 && CRM_LEAD_UUID_RE.test(t);
}

export function normalizeCrmLeadId(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Postgres / PostgREST error when `.eq("id", …)` receives a malformed UUID. */
export function isPostgresInvalidUuidError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "22P02") return true;
  const msg = String(err.message ?? "").toLowerCase();
  return msg.includes("invalid input syntax for type uuid");
}
