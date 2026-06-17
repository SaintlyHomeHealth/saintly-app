/**
 * Deduplication for PT/PTA cold-call targets. Reuses the facility normalizers so the
 * matching rules stay consistent across the app, but matches against the dedicated
 * recruiting_call_targets pipeline (NOT facilities).
 *
 * Priority: google_place_id > normalized phone > website domain > normalized name + address/city.
 */

import {
  normalizeAddressKey,
  normalizePhoneDigits,
  normalizeWebsite,
  sameCity,
  similarFacilityNames,
} from "@/lib/crm/facility-match";

export type PtColdCallTargetForMatch = {
  id: string;
  clinic_name: string;
  city: string | null;
  address: string | null;
  zip_code: string | null;
  normalized_phone: string | null;
  website_domain: string | null;
  google_place_id: string | null;
  status: string | null;
  last_called_at: string | null;
  next_follow_up_at: string | null;
};

export type PtColdCallExternalForMatch = {
  google_place_id: string;
  clinic_name: string;
  formatted_address: string;
  phone: string | null;
  website: string | null;
  city?: string | null;
};

export type PtColdCallMatchStatus = "new" | "already_in_pipeline" | "possible_match";

export type PtColdCallMatchResult = {
  match_status: PtColdCallMatchStatus;
  matched_target_id: string | null;
  matched_target_name: string | null;
  matched_status: string | null;
  matched_last_called_at: string | null;
  matched_next_follow_up_at: string | null;
  match_confidence: number;
  match_reason: string;
};

/** Domain of a website url (www stripped, path removed). */
export function websiteDomain(url: string | null | undefined): string {
  const normalized = normalizeWebsite(url);
  if (!normalized) return "";
  return normalized.split("/")[0] ?? normalized;
}

const NO_MATCH: PtColdCallMatchResult = {
  match_status: "new",
  matched_target_id: null,
  matched_target_name: null,
  matched_status: null,
  matched_last_called_at: null,
  matched_next_follow_up_at: null,
  match_confidence: 0,
  match_reason: "Not in PT Cold Calling yet",
};

export function matchExternalAgainstTargets(
  external: PtColdCallExternalForMatch,
  targets: PtColdCallTargetForMatch[]
): PtColdCallMatchResult {
  const extPlaceId = (external.google_place_id ?? "").trim();
  const extPhone = normalizePhoneDigits(external.phone);
  const extAddr = normalizeAddressKey(external.formatted_address);
  const extDomain = websiteDomain(external.website);

  let bestPossible: PtColdCallMatchResult | null = null;

  const strong = (t: PtColdCallTargetForMatch, confidence: number, reason: string): PtColdCallMatchResult => ({
    match_status: "already_in_pipeline",
    matched_target_id: t.id,
    matched_target_name: t.clinic_name,
    matched_status: t.status,
    matched_last_called_at: t.last_called_at,
    matched_next_follow_up_at: t.next_follow_up_at,
    match_confidence: confidence,
    match_reason: reason,
  });

  const possible = (t: PtColdCallTargetForMatch, confidence: number, reason: string): PtColdCallMatchResult => ({
    match_status: "possible_match",
    matched_target_id: t.id,
    matched_target_name: t.clinic_name,
    matched_status: t.status,
    matched_last_called_at: t.last_called_at,
    matched_next_follow_up_at: t.next_follow_up_at,
    match_confidence: confidence,
    match_reason: reason,
  });

  for (const t of targets) {
    const tPlaceId = (t.google_place_id ?? "").trim();
    if (extPlaceId && tPlaceId && extPlaceId === tPlaceId) {
      return strong(t, 1, "Already in PT Cold Calling (Google place match)");
    }

    const tPhone = (t.normalized_phone ?? "").trim();
    if (extPhone.length >= 10 && tPhone.length >= 10 && extPhone === tPhone) {
      return strong(t, 0.95, "Already in PT Cold Calling (phone match)");
    }

    const tAddr = normalizeAddressKey(t.address ?? "");
    if (extAddr.length >= 12 && tAddr.length >= 12 && extAddr === tAddr) {
      return strong(t, 0.92, "Already in PT Cold Calling (address match)");
    }

    const tDomain = (t.website_domain ?? "").trim();
    if (extDomain && tDomain && extDomain === tDomain) {
      const candidate = possible(t, 0.85, "Possible match by website");
      if (!bestPossible || candidate.match_confidence > bestPossible.match_confidence) bestPossible = candidate;
    }

    if (similarFacilityNames(external.clinic_name, t.clinic_name) && sameCity(external.city, t.city)) {
      const candidate = possible(t, 0.72, "Possible match by name + city");
      if (!bestPossible || candidate.match_confidence > bestPossible.match_confidence) bestPossible = candidate;
    }

    if (
      similarFacilityNames(external.clinic_name, t.clinic_name) &&
      extAddr.length >= 10 &&
      tAddr.length >= 10 &&
      (extAddr.includes(tAddr.slice(0, 10)) || tAddr.includes(extAddr.slice(0, 10)))
    ) {
      const candidate = possible(t, 0.78, "Possible match by name + address");
      if (!bestPossible || candidate.match_confidence > bestPossible.match_confidence) bestPossible = candidate;
    }
  }

  return bestPossible ?? NO_MATCH;
}
