import type { SupabaseClient } from "@supabase/supabase-js";

import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { escapeForIlike } from "@/lib/crm/crm-leads-search";
import {
  normalizeContactPrimaryPhoneForDedupe,
} from "@/lib/crm/contact-duplicate-detection";
import { contactDisplayName as crmContactDisplayName } from "@/lib/crm/crm-leads-table-helpers";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";

export type PhoneDuplicateRecordType = "lead" | "patient" | "contact";

export type PhoneDuplicateRecord = {
  recordType: PhoneDuplicateRecordType;
  recordId: string;
  contactId: string;
  name: string;
  source: string | null;
  createdAt: string | null;
  lastActivityAt: string | null;
  href: string;
};

type ContactPhoneRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  referral_source: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type LeadPhoneRow = {
  id: string;
  contact_id: string;
  source: string | null;
  referral_source: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_contact_at: string | null;
};

type PatientPhoneRow = {
  id: string;
  contact_id: string;
  referral_source: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const CONTACT_SELECT =
  "id, full_name, first_name, last_name, organization_name, primary_phone, secondary_phone, referral_source, created_at, updated_at";

function collectNormalizedPhones(
  primaryPhone?: string | null,
  secondaryPhone?: string | null
): Set<string> {
  const out = new Set<string>();
  for (const raw of [primaryPhone, secondaryPhone]) {
    const digits = normalizeContactPrimaryPhoneForDedupe(raw);
    if (digits) out.add(digits);
  }
  return out;
}

function contactMatchesAnyPhone(contact: ContactPhoneRow, targetPhones: Set<string>): boolean {
  const primary = normalizeContactPrimaryPhoneForDedupe(contact.primary_phone);
  const secondary = normalizeContactPrimaryPhoneForDedupe(contact.secondary_phone);
  if (primary && targetPhones.has(primary)) return true;
  if (secondary && targetPhones.has(secondary)) return true;
  return false;
}

function displayNameForContact(contact: ContactPhoneRow): string {
  return crmContactDisplayName(contact, { unknownLabel: "Unknown" });
}

function resolveLeadSourceLabel(source: string | null, referralSource: string | null): string | null {
  const primary = formatLeadSourceLabel(source);
  const referral = (referralSource ?? "").trim();
  if (primary !== "—" && referral) return `${primary} · ${referral}`;
  if (primary !== "—") return primary;
  return referral || null;
}

async function fetchContactsMatchingPhones(
  supabase: SupabaseClient,
  targetPhones: Set<string>,
  excludeContactId?: string | null
): Promise<ContactPhoneRow[]> {
  const byId = new Map<string, ContactPhoneRow>();
  const tails = [...new Set([...targetPhones].map((d) => d.slice(-10)))].filter((t) => t.length >= 10);

  const tasks = [];
  for (const tail of tails) {
    const esc = escapeForIlike(tail);
    const filter = `primary_phone.ilike.%${esc}%,secondary_phone.ilike.%${esc}%`;
    tasks.push(
      contactRowsActiveOnly(supabase.from("contacts").select(CONTACT_SELECT).or(filter)).limit(200)
    );
  }

  const results = await Promise.all(tasks);
  for (const res of results) {
    for (const row of (res.data ?? []) as ContactPhoneRow[]) {
      if (!row?.id || row.id === excludeContactId) continue;
      if (!contactMatchesAnyPhone(row, targetPhones)) continue;
      byId.set(row.id, row);
    }
  }

  return [...byId.values()];
}

/**
 * Finds other CRM records (leads, patients, or standalone contacts) that share a normalized
 * primary or secondary phone with the current record. Does not merge or mutate data.
 */
export async function fetchPhoneNumberDuplicateRecords(
  supabase: SupabaseClient,
  input: {
    primaryPhone?: string | null;
    secondaryPhone?: string | null;
    excludeContactId?: string | null;
    excludeLeadId?: string | null;
    excludePatientId?: string | null;
  }
): Promise<PhoneDuplicateRecord[]> {
  const targetPhones = collectNormalizedPhones(input.primaryPhone, input.secondaryPhone);
  if (targetPhones.size === 0) return [];

  const matchingContacts = await fetchContactsMatchingPhones(
    supabase,
    targetPhones,
    input.excludeContactId
  );
  if (matchingContacts.length === 0) return [];

  const contactIds = matchingContacts.map((c) => c.id);
  const contactById = new Map(matchingContacts.map((c) => [c.id, c]));

  const [leadsRes, patientsRes] = await Promise.all([
    leadRowsActiveOnly(
      supabase
        .from("leads")
        .select("id, contact_id, source, referral_source, created_at, updated_at, last_contact_at")
        .in("contact_id", contactIds)
        .limit(200)
    ),
    supabase
      .from("patients")
      .select("id, contact_id, referral_source, created_at, updated_at")
      .in("contact_id", contactIds)
      .is("archived_at", null)
      .limit(200),
  ]);

  const leads = (leadsRes.data ?? []) as LeadPhoneRow[];
  const patients = (patientsRes.data ?? []) as PatientPhoneRow[];

  const leadsByContact = new Map<string, LeadPhoneRow[]>();
  for (const lead of leads) {
    const arr = leadsByContact.get(lead.contact_id) ?? [];
    arr.push(lead);
    leadsByContact.set(lead.contact_id, arr);
  }

  const patientsByContact = new Map<string, PatientPhoneRow[]>();
  for (const patient of patients) {
    const arr = patientsByContact.get(patient.contact_id) ?? [];
    arr.push(patient);
    patientsByContact.set(patient.contact_id, arr);
  }

  const out: PhoneDuplicateRecord[] = [];

  for (const contact of matchingContacts) {
    const contactLeads = leadsByContact.get(contact.id) ?? [];
    const contactPatients = patientsByContact.get(contact.id) ?? [];
    const name = displayNameForContact(contact);

    for (const lead of contactLeads) {
      if (input.excludeLeadId && lead.id === input.excludeLeadId) continue;
      out.push({
        recordType: "lead",
        recordId: lead.id,
        contactId: contact.id,
        name,
        source: resolveLeadSourceLabel(lead.source, lead.referral_source),
        createdAt: lead.created_at,
        lastActivityAt: lead.last_contact_at ?? lead.updated_at ?? lead.created_at,
        href: `/admin/crm/leads/${lead.id}`,
      });
    }

    for (const patient of contactPatients) {
      if (input.excludePatientId && patient.id === input.excludePatientId) continue;
      out.push({
        recordType: "patient",
        recordId: patient.id,
        contactId: contact.id,
        name,
        source: (patient.referral_source ?? contact.referral_source ?? "").trim() || null,
        createdAt: patient.created_at,
        lastActivityAt: patient.updated_at ?? patient.created_at,
        href: `/admin/crm/patients/${patient.id}`,
      });
    }

    if (contactLeads.length === 0 && contactPatients.length === 0) {
      out.push({
        recordType: "contact",
        recordId: contact.id,
        contactId: contact.id,
        name,
        source: (contact.referral_source ?? "").trim() || null,
        createdAt: contact.created_at,
        lastActivityAt: contact.updated_at ?? contact.created_at,
        href: `/admin/crm/contacts/${contact.id}`,
      });
    }
  }

  out.sort((a, b) => {
    const aTime = Date.parse(a.createdAt ?? "");
    const bTime = Date.parse(b.createdAt ?? "");
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }
    return a.name.localeCompare(b.name);
  });

  return out;
}
