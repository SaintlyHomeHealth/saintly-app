import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildIncomingContactDisplayName,
  normalizedPhonesEquivalent,
  type IncomingCallerContactRow,
} from "@/lib/crm/incoming-caller-lookup";
import { findContactByIncomingPhone, type CrmContactMatch } from "@/lib/crm/find-contact-by-incoming-phone";
import {
  buildPhoneColumnOrFilter,
  digitsKeyForIncomingPhone,
  rowMatchesIncomingPhone,
} from "@/lib/crm/phone-supabase-match";
import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { normalizeRecruitingPhoneForStorage } from "@/lib/recruiting/recruiting-contact-normalize";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";

export type InboundCallerEntityType =
  | "employee"
  | "recruit"
  | "facility"
  | "facility_contact"
  | "contact"
  | "lead"
  | "patient"
  | "unknown";

export type InboundCallerIdentityUnified = {
  display_name: string | null;
  entity_type: InboundCallerEntityType;
  entity_id: string | null;
  subtitle: string | null;
  lead_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  e164: string;
  formatted_number: string;
  caller_name_source: "internal" | "lookup" | "number_only";
};

function trimPruneName(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

function contactToIncomingRow(contact: CrmContactMatch): IncomingCallerContactRow {
  return {
    full_name: contact.full_name,
    first_name: contact.first_name,
    last_name: contact.last_name,
    organization_name: contact.organization_name ?? null,
    primary_phone: contact.primary_phone,
    secondary_phone: contact.secondary_phone,
  };
}

function facilityContactDisplayName(row: {
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
 * Shared inbound PSTN identity resolution: one code path for softphone UI, Twilio routing hints, and push.
 * Priority when multiple record types match: employee > recruit > facility_contact > facility > CRM contact
 * (contact vs lead vs patient follows contact > lead > patient for the same CRM person).
 */
export async function resolveInboundCallerIdentityUnified(
  supabase: SupabaseClient,
  e164Key: string
): Promise<InboundCallerIdentityUnified> {
  const formatted = formatPhoneNumber(e164Key) || e164Key;
  const digitsKey = digitsKeyForIncomingPhone(e164Key);

  const empty = (source: "internal" | "lookup" | "number_only"): InboundCallerIdentityUnified => ({
    display_name: null,
    entity_type: "unknown",
    entity_id: null,
    subtitle: null,
    lead_id: null,
    contact_id: null,
    conversation_id: null,
    e164: e164Key,
    formatted_number: formatted,
    caller_name_source: source,
  });

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
        const nm = trimPruneName(staff.full_name);
        return {
          display_name: nm,
          entity_type: "employee",
          entity_id: staff.id,
          subtitle: "Employee",
          lead_id: null,
          contact_id: null,
          conversation_id: null,
          e164: e164Key,
          formatted_number: formatted,
          caller_name_source: nm ? "internal" : "number_only",
        };
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
      const nm = trimPruneName(typeof rc.full_name === "string" ? rc.full_name : null);
      return {
        display_name: nm,
        entity_type: "recruit",
        entity_id: rc.id,
        subtitle: "Recruit",
        lead_id: null,
        contact_id: null,
        conversation_id: null,
        e164: e164Key,
        formatted_number: formatted,
        caller_name_source: nm ? "internal" : "number_only",
      };
    }
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
        const disp = facilityContactDisplayName({
          full_name: typeof fcMatch.full_name === "string" ? fcMatch.full_name : null,
          first_name: typeof fcMatch.first_name === "string" ? fcMatch.first_name : null,
          last_name: typeof fcMatch.last_name === "string" ? fcMatch.last_name : null,
          title: typeof fcMatch.title === "string" ? fcMatch.title : null,
        });
        let facName: string | null = null;
        if (typeof fcMatch.facility_id === "string" && fcMatch.facility_id) {
          const { data: facRow } = await supabase
            .from("facilities")
            .select("name")
            .eq("id", fcMatch.facility_id)
            .maybeSingle();
          facName =
            facRow && typeof facRow.name === "string" && facRow.name.trim() ? facRow.name.trim() : null;
        }
        return {
          display_name: disp,
          entity_type: "facility_contact",
          entity_id: fcMatch.id,
          subtitle: facName,
          lead_id: null,
          contact_id: null,
          conversation_id: null,
          e164: e164Key,
          formatted_number: formatted,
          caller_name_source: disp ? "internal" : "number_only",
        };
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
        const nm = trimPruneName(fac.name);
        return {
          display_name: nm,
          entity_type: "facility",
          entity_id: fac.id,
          subtitle: null,
          lead_id: null,
          contact_id: null,
          conversation_id: null,
          e164: e164Key,
          formatted_number: formatted,
          caller_name_source: nm ? "internal" : "number_only",
        };
      }
    }
  }

  const contact = await findContactByIncomingPhone(supabase, e164Key);
  if (contact) {
    const name = buildIncomingContactDisplayName(contactToIncomingRow(contact));
    const candidates = phoneLookupCandidates(e164Key);

    const { data: leadRow } = await supabase
      .from("leads")
      .select("id")
      .eq("contact_id", contact.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const leadId = leadRow && typeof leadRow.id === "string" ? leadRow.id : null;

    const { data: patientRow } = await supabase
      .from("patients")
      .select("id")
      .eq("contact_id", contact.id)
      .limit(1)
      .maybeSingle();

    const patientId = patientRow && typeof patientRow.id === "string" ? patientRow.id : null;

    let conversationId: string | null = null;
    if (candidates.length > 0) {
      const { data: convRow } = await supabase
        .from("conversations")
        .select("id")
        .eq("channel", "sms")
        .in("main_phone_e164", candidates)
        .limit(1)
        .maybeSingle();
      conversationId = convRow && typeof convRow.id === "string" ? convRow.id : null;
    }

    // contact > lead > patient (same CRM person): "contact" entity wins when both lead and patient exist.
    let entityType: InboundCallerEntityType = "contact";
    let entityId: string | null = contact.id;
    let subtitle: string | null = null;

    if (patientId && leadId) {
      entityType = "contact";
      entityId = contact.id;
      subtitle = "Lead";
    } else if (patientId) {
      entityType = "patient";
      entityId = patientId;
      subtitle = null;
    } else if (leadId) {
      entityType = "lead";
      entityId = leadId;
      subtitle = "Lead";
    } else {
      entityType = "contact";
      entityId = contact.id;
      subtitle = null;
    }

    return {
      display_name: name,
      entity_type: entityType,
      entity_id: entityId,
      subtitle,
      lead_id: leadId,
      contact_id: contact.id,
      conversation_id: conversationId,
      e164: e164Key,
      formatted_number: formatted,
      caller_name_source: name ? "internal" : "number_only",
    };
  }

  return empty("number_only");
}
