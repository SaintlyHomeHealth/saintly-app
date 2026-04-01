/**
 * Builds a small set of strings to match CRM `contacts.primary_phone` / `secondary_phone`
 * (digits-only NANP, E.164, or legacy formatted values). Used for inbound call / SMS matching.
 */
export function phoneLookupCandidates(raw: string | null | undefined): string[] {
  if (raw == null) return [];
  const trimmed = String(raw).trim();
  if (!trimmed) return [];

  const digits = trimmed.replace(/\D/g, "");
  const out = new Set<string>();

  if (trimmed.startsWith("+")) {
    out.add(trimmed);
  }

  if (digits.length === 10) {
    out.add(`+1${digits}`);
    out.add(digits);
  } else if (digits.length === 11 && digits.startsWith("1")) {
    out.add(`+${digits}`);
    out.add(digits.slice(1));
  } else if (digits.length >= 10) {
    out.add(`+${digits}`);
  }

  return [...out].filter((s) => s.length > 0);
}
