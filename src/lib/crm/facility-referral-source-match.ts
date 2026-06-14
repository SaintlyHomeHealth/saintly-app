import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import {
  normalizeFacilityName,
  normalizePhoneDigits,
  sameCity,
  similarFacilityNames,
} from "@/lib/crm/facility-match";
import type {
  ReferralSourceMatchInput,
  ReferralSourceMatchResult,
} from "@/lib/crm/facility-referral-source-match-types";

const AUTO_ATTACH_CONFIDENCE = 0.85;

type FacilityRow = {
  id: string;
  name: string;
  city: string | null;
  main_phone: string | null;
  email: string | null;
};

type ContactRow = {
  id: string;
  facility_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  direct_phone: string | null;
  mobile_phone: string | null;
  email: string | null;
};

function emailDomain(email: string | null | undefined): string {
  const t = (email ?? "").trim().toLowerCase();
  const at = t.lastIndexOf("@");
  if (at <= 0) return "";
  return t.slice(at + 1);
}

function normalizeContactName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contactDisplayName(c: ContactRow): string {
  return (
    (c.full_name ?? "").trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
  );
}

function similarContactNames(a: string, b: string): boolean {
  const na = normalizeContactName(a);
  const nb = normalizeContactName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(" ").filter((w) => w.length > 1));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 1));
  if (wa.size === 0 || wb.size === 0) return false;
  let overlap = 0;
  for (const w of wa) {
    if (wb.has(w)) overlap += 1;
  }
  return overlap >= Math.min(wa.size, wb.size);
}

function scoreFacilityMatch(input: {
  facility: FacilityRow;
  typedName: string;
  officePhone: string;
  contactPhone: string;
  contactEmailDomain: string;
  city: string;
  contactName: string;
  contacts: ContactRow[];
}): { confidence: number; reason: string; contactId: string | null } {
  const { facility: f } = input;
  let confidence = 0;
  const reasons: string[] = [];
  let contactId: string | null = null;

  const facilityPhone = normalizePhoneDigits(f.main_phone);
  const officePhone = normalizePhoneDigits(input.officePhone);
  const contactPhone = normalizePhoneDigits(input.contactPhone);

  if (officePhone.length >= 10 && facilityPhone.length >= 10 && officePhone === facilityPhone) {
    confidence = Math.max(confidence, 0.95);
    reasons.push("exact office phone");
  }

  if (contactPhone.length >= 10) {
    for (const c of input.contacts) {
      const direct = normalizePhoneDigits(c.direct_phone);
      const mobile = normalizePhoneDigits(c.mobile_phone);
      if (contactPhone === direct || contactPhone === mobile) {
        confidence = Math.max(confidence, 0.92);
        reasons.push("contact phone match");
        contactId = c.id;
        break;
      }
    }
    if (
      !contactId &&
      facilityPhone.length >= 10 &&
      contactPhone === facilityPhone
    ) {
      confidence = Math.max(confidence, 0.9);
      reasons.push("contact phone matches facility main phone");
    }
  }

  const facilityDomain = emailDomain(f.email);
  if (input.contactEmailDomain && facilityDomain && input.contactEmailDomain === facilityDomain) {
    confidence = Math.max(confidence, 0.88);
    reasons.push("facility email domain");
  }

  if (input.contactEmailDomain) {
    for (const c of input.contacts) {
      const domain = emailDomain(c.email);
      if (domain && domain === input.contactEmailDomain) {
        confidence = Math.max(confidence, 0.9);
        reasons.push("contact email domain");
        contactId = contactId ?? c.id;
        break;
      }
    }
  }

  const nameMatch = similarFacilityNames(input.typedName, f.name);
  const cityMatch = sameCity(input.city, f.city);

  if (nameMatch && cityMatch) {
    confidence = Math.max(confidence, 0.87);
    reasons.push("similar facility name and city");
  } else if (normalizeFacilityName(input.typedName) === normalizeFacilityName(f.name) && cityMatch) {
    confidence = Math.max(confidence, 0.92);
    reasons.push("exact facility name and city");
  } else if (normalizeFacilityName(input.typedName) === normalizeFacilityName(f.name)) {
    confidence = Math.max(confidence, 0.8);
    reasons.push("exact facility name");
  } else if (nameMatch) {
    confidence = Math.max(confidence, 0.72);
    reasons.push("similar facility name");
  } else if (cityMatch && confidence > 0) {
    confidence = Math.min(confidence + 0.05, 0.84);
    reasons.push("same city");
  }

  if (input.contactName.trim()) {
    for (const c of input.contacts) {
      const display = contactDisplayName(c);
      if (display && similarContactNames(input.contactName, display)) {
        confidence = Math.max(confidence, nameMatch ? 0.86 : 0.75);
        reasons.push("contact name match");
        contactId = contactId ?? c.id;
        break;
      }
    }
  }

  return {
    confidence: Math.min(confidence, 1),
    reason: reasons.length > 0 ? reasons.join("; ") : "weak signal",
    contactId,
  };
}

export function referralSourceMatchAutoAttachThreshold(): number {
  return AUTO_ATTACH_CONFIDENCE;
}

export async function matchReferringFacilityFromPublicForm(
  input: ReferralSourceMatchInput
): Promise<ReferralSourceMatchResult> {
  const typedName = (input.referring_facility_name ?? "").trim();
  const empty: ReferralSourceMatchResult = {
    matched_facility_id: null,
    matched_contact_id: null,
    confidence: 0,
    match_reason: "No referring facility name provided",
    possible_matches: [],
  };

  if (!typedName) return empty;

  const city = (input.referring_office_city ?? "").trim();
  const contactName = (input.referring_contact_name ?? "").trim();
  const contactEmailDomain = emailDomain(input.referring_contact_email);
  const officePhone = normalizePhoneDigits(input.referring_office_phone ?? "");
  const contactPhone = normalizePhoneDigits(input.referring_contact_phone ?? "");

  const normalizedTyped = normalizeFacilityName(typedName);

  const { data: aliasRows } = await supabaseAdmin
    .from("facility_referral_source_aliases")
    .select("facility_id, contact_id, alias_name, alias_phone, alias_email_domain, alias_city")
    .limit(500);

  for (const raw of aliasRows ?? []) {
    const alias = raw as {
      facility_id: string;
      contact_id: string | null;
      alias_name: string | null;
      alias_phone: string | null;
      alias_email_domain: string | null;
      alias_city: string | null;
    };
    const aliasName = (alias.alias_name ?? "").trim();
    const aliasPhone = normalizePhoneDigits(alias.alias_phone ?? "");
    let aliasScore = 0;
    const aliasReasons: string[] = [];

    if (aliasName && similarFacilityNames(typedName, aliasName)) {
      aliasScore = 0.93;
      aliasReasons.push("stored alias name match");
    }
    if (officePhone.length >= 10 && aliasPhone.length >= 10 && officePhone === aliasPhone) {
      aliasScore = Math.max(aliasScore, 0.94);
      aliasReasons.push("stored alias phone match");
    }
    if (contactPhone.length >= 10 && aliasPhone.length >= 10 && contactPhone === aliasPhone) {
      aliasScore = Math.max(aliasScore, 0.94);
      aliasReasons.push("stored alias contact phone match");
    }
    if (contactEmailDomain && alias.alias_email_domain && contactEmailDomain === alias.alias_email_domain) {
      aliasScore = Math.max(aliasScore, 0.9);
      aliasReasons.push("stored alias email domain");
    }
    if (city && alias.alias_city && sameCity(city, alias.alias_city) && aliasScore > 0) {
      aliasScore = Math.min(aliasScore + 0.02, 0.98);
      aliasReasons.push("alias city match");
    }

    if (aliasScore >= AUTO_ATTACH_CONFIDENCE) {
      const { data: fac } = await supabaseAdmin
        .from("facilities")
        .select("id, name, city")
        .eq("id", alias.facility_id)
        .eq("is_active", true)
        .maybeSingle();
      if (fac?.id) {
        return {
          matched_facility_id: alias.facility_id,
          matched_contact_id: alias.contact_id,
          confidence: aliasScore,
          match_reason: aliasReasons.join("; "),
          possible_matches: [
            {
              facility_id: alias.facility_id,
              facility_name: String((fac as { name?: string }).name ?? "Facility"),
              city: (fac as { city?: string | null }).city ?? null,
              confidence: aliasScore,
              reason: aliasReasons.join("; "),
            },
          ],
        };
      }
    }
  }

  const { data: facilities } = await supabaseAdmin
    .from("facilities")
    .select("id, name, city, main_phone, email")
    .eq("is_active", true)
    .limit(500);

  const facilityRows = (facilities ?? []) as FacilityRow[];
  if (facilityRows.length === 0) {
    return { ...empty, match_reason: "No active facilities in portal" };
  }

  const nameCandidates = facilityRows.filter((f) => {
    if (similarFacilityNames(typedName, f.name)) return true;
    if (city && sameCity(city, f.city) && normalizedTyped.length >= 4) {
      const nf = normalizeFacilityName(f.name);
      return nf.includes(normalizedTyped) || normalizedTyped.includes(nf);
    }
    const officePhone = normalizePhoneDigits(input.referring_office_phone);
    const facilityPhone = normalizePhoneDigits(f.main_phone);
    if (officePhone.length >= 10 && facilityPhone === officePhone) return true;
    return false;
  });

  const searchIds = (nameCandidates.length > 0 ? nameCandidates : facilityRows)
    .slice(0, 80)
    .map((f) => f.id);

  const { data: contactRows } = await supabaseAdmin
    .from("facility_contacts")
    .select("id, facility_id, full_name, first_name, last_name, direct_phone, mobile_phone, email")
    .in("facility_id", searchIds)
    .eq("is_active", true)
    .limit(2000);

  const contactsByFacility = new Map<string, ContactRow[]>();
  for (const raw of contactRows ?? []) {
    const c = raw as ContactRow;
    const list = contactsByFacility.get(c.facility_id) ?? [];
    list.push(c);
    contactsByFacility.set(c.facility_id, list);
  }

  const scored: ReferralSourceMatchResult["possible_matches"] = [];
  let best: {
    facilityId: string;
    contactId: string | null;
    confidence: number;
    reason: string;
  } | null = null;

  const pool = nameCandidates.length > 0 ? nameCandidates : facilityRows.slice(0, 120);

  for (const f of pool) {
    const result = scoreFacilityMatch({
      facility: f,
      typedName,
      officePhone: input.referring_office_phone ?? "",
      contactPhone: input.referring_contact_phone ?? "",
      contactEmailDomain,
      city,
      contactName,
      contacts: contactsByFacility.get(f.id) ?? [],
    });

    if (result.confidence >= 0.5) {
      scored.push({
        facility_id: f.id,
        facility_name: f.name,
        city: f.city,
        confidence: result.confidence,
        reason: result.reason,
      });
    }

    if (!best || result.confidence > best.confidence) {
      best = {
        facilityId: f.id,
        contactId: result.contactId,
        confidence: result.confidence,
        reason: result.reason,
      };
    }
  }

  scored.sort((a, b) => b.confidence - a.confidence);

  if (!best || best.confidence < AUTO_ATTACH_CONFIDENCE) {
    return {
      matched_facility_id: null,
      matched_contact_id: null,
      confidence: best?.confidence ?? 0,
      match_reason: best?.reason ?? "No confident match",
      possible_matches: scored.slice(0, 5),
    };
  }

  return {
    matched_facility_id: best.facilityId,
    matched_contact_id: best.contactId,
    confidence: best.confidence,
    match_reason: best.reason,
    possible_matches: scored.slice(0, 5),
  };
}
