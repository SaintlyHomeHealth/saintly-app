/**
 * Map Facebook Lead Ads CSV export headers → canonical field keys used by
 * `facebook-lead-ingestion` (same as Zapier `fields` / automation path).
 */

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Known Facebook export column labels → canonical keys */
const HEADER_ALIASES: Record<string, string> = {
  "full name": "full_name",
  email: "email",
  "phone number": "phone_number",
  "zip code": "zip_code",
  "what do you or your loved one need help with?": "service_needed",
  "who is this care for?": "care_for",
  "when do you need care to start?": "start_time",
  "what is the current situation?": "situation",
  id: "id",
  "lead id": "lead_id",
  lead_id: "lead_id",
  leadgen_id: "leadgen_id",
};

/** Map normalized header → canonical key */
export function mapHeaderToCanonical(rawHeader: string): string {
  const n = norm(rawHeader);
  if (HEADER_ALIASES[n]) return HEADER_ALIASES[n];
  return n.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

/**
 * Build `Map<string, string>` with lowercased canonical keys and trimmed values.
 * Applies full_name → first_name / last_name when those are missing.
 */
export function facebookCsvRowToFieldMap(headers: string[], values: string[]): Map<string, string> {
  const m = new Map<string, string>();
  const max = Math.max(headers.length, values.length);
  for (let i = 0; i < max; i++) {
    const h = headers[i] ?? "";
    const v = values[i] ?? "";
    const key = mapHeaderToCanonical(h);
    if (!key) continue;
    const t = typeof v === "string" ? v.trim() : String(v ?? "").trim();
    if (t) m.set(key, t);
  }

  const full =
    m.get("full_name") ||
    m.get("name") ||
    m.get("your_full_name") ||
    "";
  if (full && !m.get("first_name")) {
    const parts = full.split(/\s+/).filter(Boolean);
    m.set("first_name", parts[0] ?? "");
    m.set("last_name", parts.slice(1).join(" ") || "");
  }

  return m;
}
