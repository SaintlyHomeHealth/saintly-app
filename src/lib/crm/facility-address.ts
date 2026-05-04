import {
  formatAppDate,
  formatAppDateTime,
  isoInstantToDatetimeLocalInput,
} from "@/lib/datetime/app-timezone";

/**
 * Build a single-line postal address and Google Maps search URL for field reps.
 */

export function buildFacilityFullAddress(parts: {
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const line1 = (parts.address_line_1 ?? "").trim();
  const line2 = (parts.address_line_2 ?? "").trim();
  const city = (parts.city ?? "").trim();
  const state = (parts.state ?? "").trim();
  const zip = (parts.zip ?? "").trim();

  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const segments = [line1, line2, cityStateZip].filter((s) => s.length > 0);
  return segments.join(", ");
}

export function googleMapsSearchUrlForAddress(fullAddress: string): string | null {
  const q = fullAddress.trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function formatFacilityDateTime(iso: string | null | undefined, empty = "—"): string {
  return formatAppDateTime(iso ?? null, empty, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatFacilityDate(iso: string | null | undefined, empty = "—"): string {
  return formatAppDate(iso ?? null, empty, { dateStyle: "medium" });
}

/** Value for `<input type="datetime-local" />` in America/Phoenix (agency time). */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  return isoInstantToDatetimeLocalInput(iso ?? null);
}
