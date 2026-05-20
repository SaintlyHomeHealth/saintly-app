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

/** Raw DB `leads.id` only — never contact_id or other UUID columns. */
export function parseCrmLeadIdFromRow(raw: unknown): { id: string; valid: boolean } {
  const id =
    typeof raw === "string"
      ? raw.trim()
      : raw != null && typeof raw !== "object"
        ? String(raw).trim()
        : "";
  return { id, valid: isValidCrmLeadId(id) };
}

export function crmLeadsIdDebugEnabled(): boolean {
  return process.env.CRM_LEADS_ID_DEBUG === "1";
}

/** Logs lead UUID diagnostics only (no names, phones, or notes). */
export function logCrmLeadIdDebug(
  context: string,
  fields: {
    rawFromDb?: unknown;
    normalized?: string;
    openHref?: string | null;
    hrefForClient?: string | null;
  }
): void {
  if (!crmLeadsIdDebugEnabled()) return;
  const raw =
    fields.rawFromDb == null
      ? undefined
      : typeof fields.rawFromDb === "string"
        ? fields.rawFromDb.trim()
        : String(fields.rawFromDb).trim();
  console.warn("[crm/leads-id-debug]", {
    context,
    rawFromDb: raw,
    rawLen: raw?.length,
    normalized: fields.normalized,
    openHref: fields.openHref ?? fields.hrefForClient,
  });
}

/** Postgres / PostgREST error when `.eq("id", …)` receives a malformed UUID. */
export function isPostgresInvalidUuidError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "22P02") return true;
  const msg = String(err.message ?? "").toLowerCase();
  return msg.includes("invalid input syntax for type uuid");
}
