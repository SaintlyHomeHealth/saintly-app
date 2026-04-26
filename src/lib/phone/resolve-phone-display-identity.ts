import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findContactByIncomingPhone, type CrmContactMatch } from "@/lib/crm/find-contact-by-incoming-phone";
import { buildIncomingContactDisplayName, normalizedPhonesEquivalent } from "@/lib/crm/incoming-caller-lookup";
import {
  buildPhoneColumnOrFilter,
  digitsKeyForIncomingPhone,
  rowMatchesIncomingPhone,
} from "@/lib/crm/phone-supabase-match";
import { normalizeRecruitingPhoneForStorage } from "@/lib/recruiting/recruiting-contact-normalize";
import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { routePerfLog, routePerfStart, routePerfStepsEnabled, routePerfTimed } from "@/lib/perf/route-perf";
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

const PHONE_IDENTITY_BATCH_CHUNK_SIZE = 20;

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
  const perfStart = routePerfStart();
  const out = new Map<string, PhoneDisplayIdentity>();
  if (keys.length === 0) return out;

  const contactByKey = routePerfStepsEnabled()
    ? await routePerfTimed("phone_identity_batch.contacts", () => resolveContactsByPhoneKeys(supabase, keys))
    : await resolveContactsByPhoneKeys(supabase, keys);
  const contactIds = [
    ...new Set([...contactByKey.values()].map((contact) => contact.id).filter((id): id is string => Boolean(id))),
  ];
  const [patientContactIds, leadContactIds] = routePerfStepsEnabled()
    ? await routePerfTimed("phone_identity_batch.crm_classification", () =>
        Promise.all([loadPatientContactIds(supabase, contactIds), loadLeadContactIds(supabase, contactIds)])
      )
    : await Promise.all([loadPatientContactIds(supabase, contactIds), loadLeadContactIds(supabase, contactIds)]);

  for (const [key, contact] of contactByKey) {
    out.set(key, identityFromContact(key, contact, patientContactIds, leadContactIds));
  }

  const unresolvedKeys = keys.filter((k) => !out.has(k));
  const loadFallbacks = () =>
    Promise.all(
      unresolvedKeys.map(async (k) => {
        const id = await resolvePhoneDisplayIdentity(supabase, k);
        out.set(k, id);
      })
    );
  if (routePerfStepsEnabled()) {
    await routePerfTimed("phone_identity_batch.fallbacks", loadFallbacks);
  } else {
    await loadFallbacks();
  }
  if (perfStart) {
    routePerfLog("phone_identity_batch", perfStart);
  }
  return out;
}

async function resolveContactsByPhoneKeys(
  supabase: SupabaseClient,
  keys: string[]
): Promise<Map<string, CrmContactMatch>> {
  const out = new Map<string, CrmContactMatch>();
  for (let i = 0; i < keys.length; i += PHONE_IDENTITY_BATCH_CHUNK_SIZE) {
    const chunk = keys.slice(i, i + PHONE_IDENTITY_BATCH_CHUNK_SIZE);
    const orFilter = chunk
      .map((key) => buildPhoneColumnOrFilter(["primary_phone", "secondary_phone"], key))
      .filter((filter): filter is string => Boolean(filter))
      .join(",");
    if (!orFilter) continue;

    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, full_name, organization_name, primary_phone, secondary_phone, email, contact_type, status"
      )
      .or(orFilter)
      .limit(chunk.length * 40);
    if (error) {
      console.warn("[phone-display-identity] batch contacts:", error.message);
      continue;
    }

    const rows = (data ?? []) as CrmContactMatch[];
    for (const key of chunk) {
      if (out.has(key)) continue;
      const digitsKey = digitsKeyForIncomingPhone(key);
      const match = rows.find(
        (row) =>
          normalizedPhonesEquivalent(row.primary_phone, digitsKey) ||
          normalizedPhonesEquivalent(row.secondary_phone, digitsKey)
      );
      if (match?.id) out.set(key, match);
    }
  }
  return out;
}

async function loadPatientContactIds(supabase: SupabaseClient, contactIds: string[]): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  const { data, error } = await supabase.from("patients").select("contact_id").in("contact_id", contactIds);
  if (error) {
    console.warn("[phone-display-identity] batch patients:", error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map((row) => (typeof row.contact_id === "string" ? row.contact_id : ""))
      .filter((id): id is string => Boolean(id))
  );
}

async function loadLeadContactIds(supabase: SupabaseClient, contactIds: string[]): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("leads")
    .select("contact_id")
    .in("contact_id", contactIds)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) {
    console.warn("[phone-display-identity] batch leads:", error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .map((row) => (typeof row.contact_id === "string" ? row.contact_id : ""))
      .filter((id): id is string => Boolean(id))
  );
}

function identityFromContact(
  e164Key: string,
  contact: CrmContactMatch,
  patientContactIds: Set<string>,
  leadContactIds: Set<string>
): PhoneDisplayIdentity {
  const formatted = formatPhoneNumber(e164Key) || e164Key;
  const title =
    buildIncomingContactDisplayName({
      full_name: contact.full_name,
      first_name: contact.first_name,
      last_name: contact.last_name,
      organization_name: contact.organization_name,
      primary_phone: contact.primary_phone,
      secondary_phone: contact.secondary_phone,
    }) ?? formatted;
  const entityType: PhoneDisplayEntityType = patientContactIds.has(contact.id)
    ? "patient"
    : leadContactIds.has(contact.id)
      ? "lead"
      : "contact";
  return {
    e164: e164Key,
    formattedPhone: formatted,
    displayTitle: title,
    resolvedFromEntity: Boolean(trimName(title)) && title !== formatted,
    entityType,
    contactId: contact.id,
    suppressQuickSave: true,
  };
}
