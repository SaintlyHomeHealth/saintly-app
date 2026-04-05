/**
 * CRM leads can be soft-deleted (`deleted_at` set). No other tables FK to `public.leads`
 * in this schema — phone/messages link via `contacts` — so soft delete preserves history safely.
 *
 * Chain after `.from("leads")` + `.select(...)` (or count head) so archived rows stay out of
 * default UI and automations.
 */
export function leadRowsActiveOnly<T extends { is: (column: string, value: unknown) => T }>(query: T): T {
  return query.is("deleted_at", null);
}
