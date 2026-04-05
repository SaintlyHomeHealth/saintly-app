/**
 * CRM contacts can be archived (`archived_at` set). Phone/SMS lookups still match archived rows
 * so inbound routing and history stay consistent; directory lists exclude them by default.
 */
export function contactRowsActiveOnly<T extends { is: (column: string, value: unknown) => T }>(
  query: T
): T {
  return query.is("archived_at", null);
}
