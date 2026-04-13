/** Visual triage on `leads.lead_temperature` — not pipeline status, not insurance. */

export const LEAD_TEMPERATURE_VALUES = ["hot", "warm", "cool", "dead"] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURE_VALUES)[number];

export function isValidLeadTemperature(v: string | null | undefined): v is LeadTemperature {
  return typeof v === "string" && (LEAD_TEMPERATURE_VALUES as readonly string[]).includes(v.trim());
}

/** Normalize DB/null/unknown → valid value or null (unset). */
export function normalizeLeadTemperature(raw: string | null | undefined): LeadTemperature | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  return isValidLeadTemperature(t) ? t : null;
}

export function leadTemperatureLabel(t: LeadTemperature | null): string {
  if (!t) return "—";
  switch (t) {
    case "hot":
      return "Hot";
    case "warm":
      return "Warm";
    case "cool":
      return "Cool";
    case "dead":
      return "Dead";
    default:
      return t;
  }
}

/** Sort: hot first … null last (within same created_at bucket). Lower = higher priority. */
export function leadTemperatureSortRank(t: string | null | undefined): number {
  const n = normalizeLeadTemperature(t);
  if (n === "hot") return 0;
  if (n === "warm") return 1;
  if (n === "cool") return 2;
  if (n === "dead") return 3;
  return 4;
}
