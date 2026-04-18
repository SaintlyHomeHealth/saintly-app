/** Max length for stored fbclid (query param can be long). */
const FBCLID_MAX = 2000;

/**
 * Normalize Facebook click id from form body or query string for `leads.fbclid`.
 */
export function normalizeFbclid(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > FBCLID_MAX ? t.slice(0, FBCLID_MAX) : t;
}
