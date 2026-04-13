/**
 * Detects PostgREST/Postgres errors when a migration is not applied yet
 * (missing table/column). Used to retry with a narrower select or skip optional reads.
 */
export function isMissingSchemaObjectError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "").toLowerCase();
  if (code === "42703" || code === "42P01") return true;
  if (msg.includes("does not exist") && (msg.includes("column") || msg.includes("relation"))) return true;
  return false;
}
