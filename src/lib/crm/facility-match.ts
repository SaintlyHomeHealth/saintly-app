/**
 * Normalize and compare facilities for discovery deduplication.
 */

import { buildFacilityFullAddress } from "@/lib/crm/facility-address";

export type FacilityMatchStatus = "already_in_portal" | "possible_match" | "not_in_portal";

export type FacilityMatchResult = {
  match_status: FacilityMatchStatus;
  matched_facility_id: string | null;
  matched_facility_name: string | null;
  match_confidence: number;
  match_reason: string;
};

export type PortalFacilityForMatch = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  main_phone: string | null;
  website: string | null;
  google_place_id: string | null;
};

export type ExternalPlaceForMatch = {
  google_place_id: string;
  name: string;
  formatted_address: string;
  phone: string | null;
  website: string | null;
  city?: string | null;
};

export function normalizePhoneDigits(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
}

export function normalizeAddressKey(address: string | null | undefined): string {
  return (address ?? "")
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeWebsite(url: string | null | undefined): string {
  return (url ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

export function normalizeFacilityName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function similarFacilityNames(a: string, b: string): boolean {
  const na = normalizeFacilityName(a);
  const nb = normalizeFacilityName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(" ").filter((w) => w.length > 2));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return false;
  let overlap = 0;
  for (const w of wa) {
    if (wb.has(w)) overlap += 1;
  }
  return overlap >= Math.ceil(Math.min(wa.size, wb.size) * 0.55);
}

export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = (a ?? "").trim().toLowerCase();
  const cb = (b ?? "").trim().toLowerCase();
  if (!ca || !cb) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

export function portalFacilityAddress(f: PortalFacilityForMatch): string {
  return buildFacilityFullAddress(f);
}

export function matchExternalPlaceAgainstPortal(
  external: ExternalPlaceForMatch,
  portalFacilities: PortalFacilityForMatch[]
): FacilityMatchResult {
  const extPlaceId = (external.google_place_id ?? "").trim();
  const extPhone = normalizePhoneDigits(external.phone);
  const extAddr = normalizeAddressKey(external.formatted_address);
  const extWeb = normalizeWebsite(external.website);

  let bestPossible: FacilityMatchResult | null = null;

  for (const f of portalFacilities) {
    const storedPlaceId = (f.google_place_id ?? "").trim();
    if (extPlaceId && storedPlaceId && extPlaceId === storedPlaceId) {
      return {
        match_status: "already_in_portal",
        matched_facility_id: f.id,
        matched_facility_name: f.name,
        match_confidence: 1,
        match_reason: "Matched by Google Place ID",
      };
    }

    const portalPhone = normalizePhoneDigits(f.main_phone);
    if (extPhone.length >= 10 && portalPhone.length >= 10 && extPhone === portalPhone) {
      return {
        match_status: "already_in_portal",
        matched_facility_id: f.id,
        matched_facility_name: f.name,
        match_confidence: 0.95,
        match_reason: "Matched by phone",
      };
    }

    const portalAddr = normalizeAddressKey(portalFacilityAddress(f));
    if (extAddr.length >= 12 && portalAddr.length >= 12 && extAddr === portalAddr) {
      return {
        match_status: "already_in_portal",
        matched_facility_id: f.id,
        matched_facility_name: f.name,
        match_confidence: 0.92,
        match_reason: "Matched by address",
      };
    }

    const portalWeb = normalizeWebsite(f.website);
    if (extWeb && portalWeb && extWeb === portalWeb) {
      const candidate: FacilityMatchResult = {
        match_status: "possible_match",
        matched_facility_id: f.id,
        matched_facility_name: f.name,
        match_confidence: 0.85,
        match_reason: "Possible match by website",
      };
      if (!bestPossible || candidate.match_confidence > bestPossible.match_confidence) {
        bestPossible = candidate;
      }
    }

    if (similarFacilityNames(external.name, f.name) && sameCity(external.city, f.city)) {
      const candidate: FacilityMatchResult = {
        match_status: "possible_match",
        matched_facility_id: f.id,
        matched_facility_name: f.name,
        match_confidence: 0.72,
        match_reason: "Possible match by similar name and city",
      };
      if (!bestPossible || candidate.match_confidence > bestPossible.match_confidence) {
        bestPossible = candidate;
      }
    }

    if (
      similarFacilityNames(external.name, f.name) &&
      extAddr.length >= 10 &&
      portalAddr.length >= 10 &&
      (extAddr.includes(portalAddr.slice(0, 10)) || portalAddr.includes(extAddr.slice(0, 10)))
    ) {
      const candidate: FacilityMatchResult = {
        match_status: "possible_match",
        matched_facility_id: f.id,
        matched_facility_name: f.name,
        match_confidence: 0.78,
        match_reason: "Possible match by similar name and address",
      };
      if (!bestPossible || candidate.match_confidence > bestPossible.match_confidence) {
        bestPossible = candidate;
      }
    }

    if (
      extPhone.length >= 10 &&
      portalPhone.length >= 10 &&
      extPhone.slice(-7) === portalPhone.slice(-7) &&
      extPhone !== portalPhone
    ) {
      const candidate: FacilityMatchResult = {
        match_status: "possible_match",
        matched_facility_id: f.id,
        matched_facility_name: f.name,
        match_confidence: 0.68,
        match_reason: "Possible match by similar phone number",
      };
      if (!bestPossible || candidate.match_confidence > bestPossible.match_confidence) {
        bestPossible = candidate;
      }
    }
  }

  if (bestPossible) return bestPossible;

  return {
    match_status: "not_in_portal",
    matched_facility_id: null,
    matched_facility_name: null,
    match_confidence: 0,
    match_reason: "No portal match found",
  };
}

export type QuickAddDuplicateCandidate = {
  id: string;
  name: string;
  city: string | null;
  main_phone: string | null;
  address: string;
  match_reason: string;
  match_confidence: number;
};

export function findQuickAddDuplicates(
  draft: ExternalPlaceForMatch & { google_place_id: string },
  portalFacilities: PortalFacilityForMatch[]
): QuickAddDuplicateCandidate[] {
  const match = matchExternalPlaceAgainstPortal(draft, portalFacilities);
  if (match.match_status === "not_in_portal") return [];

  const f = portalFacilities.find((p) => p.id === match.matched_facility_id);
  if (!f) return [];

  return [
    {
      id: f.id,
      name: f.name,
      city: f.city,
      main_phone: f.main_phone,
      address: portalFacilityAddress(f),
      match_reason: match.match_reason,
      match_confidence: match.match_confidence,
    },
  ];
}

/**
 * Parse US formatted address from Google Places into structured fields.
 */
export function parseUsFormattedAddress(formatted: string): {
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
} {
  const parts = formatted
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { address_line_1: formatted.trim(), city: "", state: "", zip: "" };
  }

  const filtered = parts[parts.length - 1]?.toLowerCase() === "usa" ? parts.slice(0, -1) : parts;
  const address_line_1 = filtered[0] ?? "";
  const city = filtered.length >= 2 ? filtered[1] : "";

  let state = "";
  let zip = "";
  if (filtered.length >= 3) {
    const stateZip = filtered[2];
    const m = stateZip.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    if (m) {
      state = m[1].toUpperCase();
      zip = m[2];
    } else {
      const tokens = stateZip.split(/\s+/);
      state = tokens[0]?.toUpperCase() ?? "";
      zip = tokens[1] ?? "";
    }
  }

  return { address_line_1, city, state, zip };
}
