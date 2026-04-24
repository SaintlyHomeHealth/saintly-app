import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { buildIncomingContactDisplayName, normalizedPhonesEquivalent } from "@/lib/crm/incoming-caller-lookup";
import {
  buildPhoneColumnOrFilter,
  digitsKeyForIncomingPhone,
  rowMatchesIncomingPhone,
} from "@/lib/crm/phone-supabase-match";
import { normalizeRecruitingPhoneForStorage } from "@/lib/recruiting/recruiting-contact-normalize";
import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export type PhoneDisplayEntityType =
  | "contact"
  | "patient"
  | "lead"
  | "recruit"
  | "employee"
  | "facility"
  | "facility_contact"
  | "unknown";

export type PhoneDisplayIdentity = {
  e164: string;
  formattedPhone: string;
  displayTitle: string;
  resolvedFromEntity: boolean;
  entityType: PhoneDisplayEntityType;
  contactId: string | null;
  suppressQuickSave: boolean;
};

type RankedMatch = {
  rank: number;
  title: string;
  entityType: PhoneDisplayEntityType;
  contactId: string | null;
};

const RANK_CONTACT = 10;
const RANK_FACILITY_CONTACT = 35;
const RANK_RECRUIT = 40;
const RANK_EMPLOYEE = 50;
const RANK_FACILITY = 60;

function trimName(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

function facilityContactPersonName(row: {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
}): string | null {
  const fn = (row.full_name ?? "").trim();
  if (fn) return fn;
  const first = (row.first_name ?? "").trim();
  const last = (row.last_name ?? "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  const t = (row.title ?? "").trim();
  return t || null;
}

type FacilityContactRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  direct_phone: string | null;
  mobile_phone: string | null;
  facility_id: string;
};

/**
 * Normalize to E.164 for CRM/directory matching (NANP + strict E.164). Returns null when not dialable.
 */
export function phoneRawToE164LookupKey(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t || t.toLowerCase().startsWith("client:")) return null;
  const strict = normalizeDialInputToE164(t);
  if (strict && isValidE164(strict)) return strict;
  const d = normalizePhone(t);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/**
 * Resolve a human-readable title for a phone number (call log, inbox, keypad).
 * Priority: CRM contact → facility contact person → recruit → employee → facility org → formatted number.
 * Patient/lead names live on the CRM contact row in this schema (same phone), so they are covered by the contact tier.
 */
export async function resolvePhoneDisplayIdentity(
  supabase: SupabaseClient,
  phoneNumber: string | null | undefined
): Promise<PhoneDisplayIdentity> {
  const raw = typeof phoneNumber === "string" ? phoneNumber.trim() : "";
  const e164Key = phoneRawToE164LookupKey(raw);
  const formattedFallback = formatPhoneNumber(raw) || raw || "—";

  if (!e164Key) {
    return {
      e164: raw,
      formattedPhone: formattedFallback,
      displayTitle: formattedFallback,
      resolvedFromEntity: false,
      entityType: "unknown",
      contactId: null,
      suppressQuickSave: false,
    };
  }

  const formatted = formatPhoneNumber(e164Key) || e164Key;
  const digitsKey = digitsKeyForIncomingPhone(e164Key);
  const matches: RankedMatch[] = [];

  const contact = await findContactByIncomingPhone(supabase, e164Key);
  if (contact) {
    const title =
      buildIncomingContactDisplayName({
        full_name: contact.full_name,
        first_name: contact.first_name,
        last_name: contact.last_name,
        organization_name: contact.organization_name,
        primary_phone: contact.primary_phone,
        secondary_phone: contact.secondary_phone,
      }) ?? formatted;

    const { data: patientRow } = await supabase
      .from("patients")
      .select("id")
      .eq("contact_id", contact.id)
      .limit(1)
      .maybeSingle();

    const { data: leadRow } = await supabase
      .from("leads")
      .select("id")
      .eq("contact_id", contact.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let entityType: PhoneDisplayEntityType = "contact";
    if (patientRow?.id) {
      entityType = "patient";
    } else if (leadRow?.id) {
      entityType = "lead";
    }

    matches.push({
      rank: RANK_CONTACT,
      title,
      entityType,
      contactId: contact.id,
    });
  }

  const fcFilter = buildPhoneColumnOrFilter(["direct_phone", "mobile_phone"], e164Key);
  if (fcFilter) {
    const { data: fcData, error: fcErr } = await supabase
      .from("facility_contacts")
      .select("id, full_name, first_name, last_name, title, direct_phone, mobile_phone, facility_id")
      .or(fcFilter)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (!fcErr && fcData?.length) {
      const fcMatch = (fcData as FacilityContactRow[]).find((r) =>
        rowMatchesIncomingPhone([r.direct_phone, r.mobile_phone], digitsKey)
      );
      if (fcMatch) {
        let facName: string | null = null;
        if (typeof fcMatch.facility_id === "string" && fcMatch.facility_id) {
          const { data: facRow } = await supabase
            .from("facilities")
            .select("name")
            .eq("id", fcMatch.facility_id)
            .maybeSingle();
          facName = facRow && typeof facRow.name === "string" && facRow.name.trim() ? facRow.name.trim() : null;
        }
        const person = facilityContactPersonName({
          full_name: typeof fcMatch.full_name === "string" ? fcMatch.full_name : null,
          first_name: typeof fcMatch.first_name === "string" ? fcMatch.first_name : null,
          last_name: typeof fcMatch.last_name === "string" ? fcMatch.last_name : null,
          title: typeof fcMatch.title === "string" ? fcMatch.title : null,
        });
        const title = person ?? facName ?? formatted;
        matches.push({
          rank: RANK_FACILITY_CONTACT,
          title,
          entityType: "facility_contact",
          contactId: null,
        });
      }
    }
  }

  const np = normalizeRecruitingPhoneForStorage(e164Key);
  if (np) {
    const { data: rc } = await supabase
      .from("recruiting_candidates")
      .select("id, full_name")
      .eq("normalized_phone", np)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rc && typeof rc.id === "string") {
      const nm = trimName(typeof rc.full_name === "string" ? rc.full_name : null);
      matches.push({
        rank: RANK_RECRUIT,
        title: nm ?? formatted,
        entityType: "recruit",
        contactId: null,
      });
    }
  }

  const staffFilter = buildPhoneColumnOrFilter(["sms_notify_phone"], e164Key);
  if (staffFilter) {
    const { data: staffRows, error: staffErr } = await supabase
      .from("staff_profiles")
      .select("id, full_name, sms_notify_phone, updated_at")
      .or(staffFilter)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (!staffErr && staffRows?.length) {
      const staff = (staffRows as { id: string; full_name: string | null; sms_notify_phone: string | null }[]).find(
        (r) => normalizedPhonesEquivalent(r.sms_notify_phone, digitsKey)
      );
      if (staff) {
        const nm = trimName(staff.full_name);
        matches.push({
          rank: RANK_EMPLOYEE,
          title: nm ?? formatted,
          entityType: "employee",
          contactId: null,
        });
      }
    }
  }

  const facFilter = buildPhoneColumnOrFilter(["main_phone"], e164Key);
  if (facFilter) {
    const { data: facRows, error: facOrgErr } = await supabase
      .from("facilities")
      .select("id, name, main_phone, updated_at")
      .or(facFilter)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (!facOrgErr && facRows?.length) {
      const fac = (facRows as { id: string; name: string; main_phone: string | null }[]).find((r) =>
        normalizedPhonesEquivalent(r.main_phone, digitsKey)
      );
      if (fac) {
        const nm = trimName(fac.name);
        matches.push({
          rank: RANK_FACILITY,
          title: nm ?? formatted,
          entityType: "facility",
          contactId: null,
        });
      }
    }
  }

  if (matches.length === 0) {
    return {
      e164: e164Key,
      formattedPhone: formatted,
      displayTitle: formatted,
      resolvedFromEntity: false,
      entityType: "unknown",
      contactId: null,
      suppressQuickSave: false,
    };
  }

  matches.sort((a, b) => a.rank - b.rank);
  const hasCrmContact = matches.some((m) => m.rank === RANK_CONTACT);
  let best: RankedMatch;
  if (hasCrmContact) {
    const crmMatches = matches.filter((m) => m.rank === RANK_CONTACT);
    best =
      crmMatches.find((m) => Boolean(trimName(m.title)) && trimName(m.title) !== formatted) ?? crmMatches[0]!;
  } else {
    best =
      matches.find((m) => Boolean(trimName(m.title)) && trimName(m.title) !== formatted) ?? matches[0]!;
  }

  const nameLine = trimName(best.title);
  const resolvedFromEntity =
    best.entityType !== "unknown" && Boolean(nameLine) && nameLine !== formatted;

  const suppressQuickSave =
    best.entityType === "contact" ||
    best.entityType === "patient" ||
    best.entityType === "lead" ||
    best.entityType === "facility_contact" ||
    best.entityType === "facility" ||
    best.entityType === "employee" ||
    best.entityType === "recruit";

  return {
    e164: e164Key,
    formattedPhone: formatted,
    displayTitle: best.title,
    resolvedFromEntity,
    entityType: best.entityType,
    contactId: best.contactId,
    suppressQuickSave,
  };
}

/**
 * Batch resolve for call lists (dedupes E.164 keys; one round-trip set per unique number).
 */
export async function resolvePhoneDisplayIdentityBatch(
  supabase: SupabaseClient,
  phoneNumbers: (string | null | undefined)[]
): Promise<Map<string, PhoneDisplayIdentity>> {
  const keys = [...new Set(phoneNumbers.map((p) => phoneRawToE164LookupKey(p)).filter((k): k is string => Boolean(k)))];
  const out = new Map<string, PhoneDisplayIdentity>();
  await Promise.all(
    keys.map(async (k) => {
      const id = await resolvePhoneDisplayIdentity(supabase, k);
      out.set(k, id);
    })
  );
  return out;
}
