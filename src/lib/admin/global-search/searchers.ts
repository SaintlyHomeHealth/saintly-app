import type { SupabaseClient } from "@supabase/supabase-js";

import { buildIncomingContactDisplayName } from "@/lib/crm/incoming-caller-lookup";
import { buildPhoneColumnOrFilter } from "@/lib/crm/phone-supabase-match";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

import { globalSearchHref } from "./hrefs";
import { phoneDigitsMatch } from "./rank";
import type { ParsedGlobalSearchQuery } from "./types";
import {
  buildApplicantSourceTrail,
  buildCallSourceTrail,
  buildFaxSourceTrail,
  buildInboundEmailSourceTrail,
  buildLeadSourceTrail,
  buildPatientSourceTrail,
  buildPrivatePaySourceTrail,
  buildRecruitSourceTrail,
  resolvePrimarySourceLabel,
} from "./source-trail";
import type { GlobalSearchResult } from "./types";

const PER_TABLE_LIMIT = 12;

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  organization_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  email: string | null;
  referral_source: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type LeadRow = {
  id: string;
  contact_id: string;
  source: string | null;
  referral_source: string | null;
  produced_by_source: string | null;
  external_source_metadata: unknown;
  fbclid: string | null;
  status: string | null;
  medicare_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_contact_at: string | null;
  converted_patient_id: string | null;
  produced_by_sales_agent_id: string | null;
  contacts: ContactRow | ContactRow[] | null;
};

type PatientRow = {
  id: string;
  contact_id: string;
  patient_status: string | null;
  referral_source: string | null;
  created_at: string;
  updated_at: string;
  contacts: ContactRow | ContactRow[] | null;
};

function firstContact(row: { contacts: ContactRow | ContactRow[] | null }): ContactRow | null {
  const c = row.contacts;
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

function contactDisplayName(c: ContactRow | null): string {
  if (!c) return "Unknown";
  return (
    buildIncomingContactDisplayName(c) ??
    ([c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      c.organization_name?.trim() ||
      "Unknown")
  );
}

function matchedFieldsForContact(c: ContactRow | null, query: ParsedGlobalSearchQuery): string[] {
  const fields: string[] = [];
  if (!c) return ["name"];
  if (query.isPhone) {
    if (phoneDigitsMatch(c.primary_phone, query.digits) || phoneDigitsMatch(c.secondary_phone, query.digits)) {
      fields.push("phone");
    }
  }
  if (query.isEmail && c.email?.trim().toLowerCase() === query.lower) fields.push("email");
  if (!query.isPhone && !query.isEmail) {
    const name = contactDisplayName(c).toLowerCase();
    if (name.includes(query.lower)) fields.push("name");
    if (c.email?.toLowerCase().includes(query.lower)) fields.push("email");
    if (phoneDigitsMatch(c.primary_phone, query.digits) || phoneDigitsMatch(c.secondary_phone, query.digits)) {
      fields.push("phone");
    }
    if (c.organization_name?.toLowerCase().includes(query.lower)) fields.push("organization");
    if (c.referral_source?.toLowerCase().includes(query.lower)) fields.push("referral_source");
    if (c.notes?.toLowerCase().includes(query.lower)) fields.push("notes");
  }
  return fields.length > 0 ? fields : ["name"];
}

function matchedFieldsForLead(lead: LeadRow, query: ParsedGlobalSearchQuery, contactFields: string[]): string[] {
  const fields = new Set(contactFields);
  if (lead.medicare_number?.toLowerCase().includes(query.lower)) fields.add("medicare");
  if (lead.referral_source?.toLowerCase().includes(query.lower)) fields.add("referral_source");
  if (lead.source?.toLowerCase().includes(query.lower)) fields.add("source");
  if (lead.produced_by_source?.toLowerCase().includes(query.lower)) fields.add("produced_by");
  if (lead.notes?.toLowerCase().includes(query.lower)) fields.add("notes");
  const meta = lead.external_source_metadata;
  if (meta && typeof meta === "object") {
    const blob = JSON.stringify(meta).toLowerCase();
    if (blob.includes(query.lower)) fields.add("campaign");
  }
  return [...fields];
}

async function loadStaffNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("staff_profiles").select("user_id, full_name, email").in("user_id", ids);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const label = (row.full_name ?? row.email ?? "").trim();
    if (row.user_id && label) map.set(row.user_id, label);
  }
  return map;
}

function leadToResult(lead: LeadRow, query: ParsedGlobalSearchQuery, staffNames: Map<string, string>): GlobalSearchResult {
  const contact = firstContact(lead);
  const contactFields = matchedFieldsForContact(contact, query);
  const matchedFields = matchedFieldsForLead(lead, query, contactFields);
  const agentName = lead.produced_by_sales_agent_id
    ? staffNames.get(lead.produced_by_sales_agent_id) ?? null
    : null;
  const sourceTrail = buildLeadSourceTrail({ ...lead, produced_by_sales_agent_name: agentName });
  return {
    type: "lead",
    id: lead.id,
    title: contactDisplayName(contact),
    phone: formatPhoneForDisplay(contact?.primary_phone ?? contact?.secondary_phone) || null,
    email: contact?.email?.trim() || null,
    status: lead.status?.replace(/_/g, " ") ?? null,
    source: resolvePrimarySourceLabel(sourceTrail),
    sourceTrail,
    matchedFields,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
    lastActivityAt: lead.last_contact_at ?? lead.updated_at,
    href: globalSearchHref("lead", lead.id),
  };
}

function patientToResult(
  patient: PatientRow,
  query: ParsedGlobalSearchQuery,
  leadTrail?: string[] | null
): GlobalSearchResult {
  const contact = firstContact(patient);
  const matchedFields = matchedFieldsForContact(contact, query);
  const sourceTrail = buildPatientSourceTrail(patient, leadTrail);
  return {
    type: "patient",
    id: patient.id,
    title: contactDisplayName(contact),
    phone: formatPhoneForDisplay(contact?.primary_phone ?? contact?.secondary_phone) || null,
    email: contact?.email?.trim() || null,
    status: patient.patient_status?.replace(/_/g, " ") ?? null,
    source: resolvePrimarySourceLabel(sourceTrail),
    sourceTrail,
    matchedFields,
    createdAt: patient.created_at,
    updatedAt: patient.updated_at,
    lastActivityAt: patient.updated_at,
    href: globalSearchHref("patient", patient.id),
  };
}

export async function searchLeadsAndPatients(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<{ results: GlobalSearchResult[]; leadTrailsByContactId: Map<string, string[]> }> {
  const results: GlobalSearchResult[] = [];
  const leadTrailsByContactId = new Map<string, string[]>();
  const contactSelect =
    "id, first_name, last_name, full_name, organization_name, primary_phone, secondary_phone, email, referral_source, notes, status, created_at, updated_at";

  let contactIdsFromPhone: string[] = [];
  if (query.isPhone) {
    const phoneFilter = buildPhoneColumnOrFilter(["primary_phone", "secondary_phone"], query.raw);
    if (phoneFilter) {
      const { data: contactHits } = await supabase
        .from("contacts")
        .select("id")
        .or(phoneFilter)
        .is("archived_at", null)
        .limit(PER_TABLE_LIMIT);
      contactIdsFromPhone = (contactHits ?? []).map((r) => r.id);
    }
  }

  let contactIdsFromText: string[] = [];
  if (!query.isPhone) {
    const { data: textContacts } = await supabase
      .from("contacts")
      .select("id")
      .is("archived_at", null)
      .or(
        [
          `full_name.ilike.${query.ilikePattern}`,
          `first_name.ilike.${query.ilikePattern}`,
          `last_name.ilike.${query.ilikePattern}`,
          `email.ilike.${query.ilikePattern}`,
          `organization_name.ilike.${query.ilikePattern}`,
          `referral_source.ilike.${query.ilikePattern}`,
          `notes.ilike.${query.ilikePattern}`,
          `primary_phone.ilike.${query.ilikePattern}`,
          `secondary_phone.ilike.${query.ilikePattern}`,
        ].join(",")
      )
      .limit(PER_TABLE_LIMIT);
    contactIdsFromText = (textContacts ?? []).map((r) => r.id);
  }

  const leadOrParts: string[] = [];
  const contactIds = [...new Set([...contactIdsFromPhone, ...contactIdsFromText])];
  if (contactIds.length > 0) {
    leadOrParts.push(`contact_id.in.(${contactIds.join(",")})`);
  }
  if (query.isPhone) {
    const caregiverFilter = buildPhoneColumnOrFilter(["caregiver_phone_number"], query.raw);
    if (caregiverFilter) leadOrParts.push(caregiverFilter);
  }
  if (!query.isPhone) {
    leadOrParts.push(
      `medicare_number.ilike.${query.ilikePattern}`,
      `referral_source.ilike.${query.ilikePattern}`,
      `notes.ilike.${query.ilikePattern}`,
      `produced_by_source.ilike.${query.ilikePattern}`,
      `source.ilike.${query.ilikePattern}`
    );
  }

  let leadsQuery = supabase
    .from("leads")
    .select(
      `id, contact_id, source, referral_source, produced_by_source, external_source_metadata, fbclid, status, medicare_number, notes, created_at, updated_at, last_contact_at, converted_patient_id, produced_by_sales_agent_id, contacts!inner(${contactSelect})`
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(PER_TABLE_LIMIT);

  if (leadOrParts.length > 0) {
    leadsQuery = leadsQuery.or(leadOrParts.join(","));
  } else if (query.isEmail) {
    const { data: emailContacts } = await supabase
      .from("contacts")
      .select("id")
      .is("archived_at", null)
      .ilike("email", query.ilikePattern)
      .limit(PER_TABLE_LIMIT);
    const emailContactIds = (emailContacts ?? []).map((r) => r.id);
    if (emailContactIds.length === 0) {
      return { results, leadTrailsByContactId };
    }
    leadsQuery = leadsQuery.in("contact_id", emailContactIds);
  } else if (!query.isPhone) {
    return { results, leadTrailsByContactId };
  } else {
    return { results, leadTrailsByContactId };
  }

  const { data: leadRows, error: leadError } = await leadsQuery;
  if (leadError) console.warn("[global-search] leads:", leadError.message);

  const leads = (leadRows ?? []) as LeadRow[];
  const staffNames = await loadStaffNames(
    supabase,
    leads.map((l) => l.produced_by_sales_agent_id).filter(Boolean) as string[]
  );

  const leadTrailsByContactIdLocal = new Map<string, string[]>();
  for (const lead of leads) {
    const result = leadToResult(lead, query, staffNames);
    results.push(result);
    if (lead.contact_id) {
      leadTrailsByContactIdLocal.set(lead.contact_id, result.sourceTrail);
      leadTrailsByContactId.set(lead.contact_id, result.sourceTrail);
    }
  }

  let patientsQuery = supabase
    .from("patients")
    .select(`id, contact_id, patient_status, referral_source, created_at, updated_at, contacts!inner(${contactSelect})`)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(PER_TABLE_LIMIT);

  if (contactIds.length > 0) {
    patientsQuery = patientsQuery.in("contact_id", contactIds);
  } else if (query.isEmail) {
    const { data: emailContacts } = await supabase
      .from("contacts")
      .select("id")
      .is("archived_at", null)
      .ilike("email", query.ilikePattern)
      .limit(PER_TABLE_LIMIT);
    const emailContactIds = (emailContacts ?? []).map((r) => r.id);
    if (emailContactIds.length === 0) {
      return { results, leadTrailsByContactId };
    }
    patientsQuery = patientsQuery.in("contact_id", emailContactIds);
  } else if (!query.isPhone) {
    return { results, leadTrailsByContactId };
  } else {
    return { results, leadTrailsByContactId };
  }

  const { data: patientRows, error: patientError } = await patientsQuery;
  if (patientError) console.warn("[global-search] patients:", patientError.message);

  for (const patient of (patientRows ?? []) as PatientRow[]) {
    const trail = patient.contact_id ? leadTrailsByContactIdLocal.get(patient.contact_id) : null;
    results.push(patientToResult(patient, query, trail));
  }

  if (!query.isPhone && contactIds.length === 0) {
    const leadContactIds = new Set(leads.map((l) => l.contact_id));
    const { data: contactRows } = await supabase
      .from("contacts")
      .select(contactSelect)
      .is("archived_at", null)
      .or(
        [
          `full_name.ilike.${query.ilikePattern}`,
          `first_name.ilike.${query.ilikePattern}`,
          `last_name.ilike.${query.ilikePattern}`,
          `email.ilike.${query.ilikePattern}`,
          `organization_name.ilike.${query.ilikePattern}`,
          `referral_source.ilike.${query.ilikePattern}`,
          `notes.ilike.${query.ilikePattern}`,
          `primary_phone.ilike.${query.ilikePattern}`,
          `secondary_phone.ilike.${query.ilikePattern}`,
        ].join(",")
      )
      .limit(8);

    for (const c of (contactRows ?? []) as ContactRow[]) {
      if (leadContactIds.has(c.id)) continue;
      const matchedFields = matchedFieldsForContact(c, query);
      const sourceTrail = [(c.referral_source ?? "").trim() || "Contact", "CRM Contact"].filter(Boolean);
      results.push({
        type: "contact",
        id: c.id,
        title: contactDisplayName(c),
        phone: formatPhoneForDisplay(c.primary_phone ?? c.secondary_phone) || null,
        email: c.email?.trim() || null,
        status: c.status?.replace(/_/g, " ") ?? null,
        source: c.referral_source?.trim() || null,
        sourceTrail,
        matchedFields,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        lastActivityAt: c.updated_at,
        href: globalSearchHref("contact", c.id),
      });
    }
  }

  return { results, leadTrailsByContactId };
}

export async function searchPhoneCalls(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery,
  leadTrailsByContactId: Map<string, string[]>
): Promise<GlobalSearchResult[]> {
  const results: GlobalSearchResult[] = [];
  let callsQuery = supabase
    .from("phone_calls")
    .select(
      "id, direction, from_e164, to_e164, status, contact_id, created_at, updated_at, started_at, metadata, assigned_to_label"
    )
    .order("created_at", { ascending: false })
    .limit(PER_TABLE_LIMIT);

  if (query.isPhone) {
    const phoneFilter = buildPhoneColumnOrFilter(["from_e164", "to_e164"], query.raw);
    if (!phoneFilter) return results;
    callsQuery = callsQuery.or(phoneFilter);
  } else {
    callsQuery = callsQuery.or(
      [
        `assigned_to_label.ilike.${query.ilikePattern}`,
        `metadata->>caller_name.ilike.${query.ilikePattern}`,
        `metadata->>display_name.ilike.${query.ilikePattern}`,
      ].join(",")
    );
  }

  const { data, error } = await callsQuery;
  if (error) {
    console.warn("[global-search] phone_calls:", error.message);
    return results;
  }

  for (const row of data ?? []) {
    const inbound = (row.direction ?? "").toLowerCase() === "inbound";
    const party = inbound ? row.from_e164 : row.to_e164;
    const meta = row.metadata as Record<string, unknown> | null;
    const callerName =
      (typeof meta?.caller_name === "string" ? meta.caller_name : null) ??
      (typeof meta?.display_name === "string" ? meta.display_name : null);
    const title = callerName?.trim() || formatPhoneForDisplay(party) || "Phone call";
    const matchedFields: string[] = [];
    if (query.isPhone && phoneDigitsMatch(party, query.digits)) matchedFields.push("caller_number");
    if (callerName?.toLowerCase().includes(query.lower)) matchedFields.push("caller_name");
    if (matchedFields.length === 0) matchedFields.push(query.isPhone ? "caller_number" : "caller_name");

    const leadTrail = row.contact_id ? leadTrailsByContactId.get(row.contact_id) : null;
    const sourceTrail = buildCallSourceTrail({
      hasLead: Boolean(leadTrail),
      hasPatient: false,
      hasContact: Boolean(row.contact_id),
      leadTrail,
    });

    results.push({
      type: "call",
      id: row.id,
      title,
      phone: formatPhoneForDisplay(party) || null,
      email: null,
      status: row.status?.replace(/_/g, " ") ?? null,
      source: resolvePrimarySourceLabel(sourceTrail),
      sourceTrail,
      matchedFields,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.started_at ?? row.created_at,
      href: globalSearchHref("call", row.id),
      callDirection: row.direction,
      callPartyNumber: formatPhoneForDisplay(party) || null,
      relatedEntityLabel: row.contact_id ? "Linked contact" : null,
    });
  }

  return results;
}

export async function searchPrivatePay(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<GlobalSearchResult[]> {
  const orParts = [
    `billing_name.ilike.${query.ilikePattern}`,
    `billing_email.ilike.${query.ilikePattern}`,
    `invoice_number.ilike.${query.ilikePattern}`,
    `notes.ilike.${query.ilikePattern}`,
  ];
  if (query.isPhone) {
    const phoneFilter = buildPhoneColumnOrFilter(["billing_phone"], query.raw);
    if (phoneFilter) orParts.push(phoneFilter);
  } else {
    orParts.push(`billing_phone.ilike.${query.ilikePattern}`);
  }

  const { data, error } = await supabase
    .from("private_pay_invoices")
    .select(
      "id, billing_name, billing_email, billing_phone, invoice_number, status, notes, created_at, updated_at, contact_id, patient_id, lead_id"
    )
    .or(orParts.join(","))
    .order("updated_at", { ascending: false })
    .limit(PER_TABLE_LIMIT);

  if (error) {
    console.warn("[global-search] private_pay:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const matchedFields: string[] = [];
    if (query.isPhone && phoneDigitsMatch(row.billing_phone, query.digits)) matchedFields.push("phone");
    if (query.isEmail && row.billing_email?.toLowerCase() === query.lower) matchedFields.push("email");
    if (row.billing_name?.toLowerCase().includes(query.lower)) matchedFields.push("name");
    if (row.invoice_number?.toLowerCase().includes(query.lower)) matchedFields.push("invoice_number");
    if (matchedFields.length === 0) matchedFields.push("name");

    const sourceTrail = buildPrivatePaySourceTrail({ hasPatient: Boolean(row.patient_id) });
    return {
      type: "private_pay" as const,
      id: row.id,
      title: row.billing_name?.trim() || row.invoice_number || "Private pay invoice",
      phone: formatPhoneForDisplay(row.billing_phone) || null,
      email: row.billing_email?.trim() || null,
      status: row.status?.replace(/_/g, " ") ?? null,
      source: "Private Pay",
      sourceTrail,
      matchedFields,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.updated_at,
      href: globalSearchHref("private_pay", row.id),
    };
  });
}

export async function searchFaxMessages(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<GlobalSearchResult[]> {
  const orParts = [
    `sender_name.ilike.${query.ilikePattern}`,
    `recipient_name.ilike.${query.ilikePattern}`,
    `subject.ilike.${query.ilikePattern}`,
    `note.ilike.${query.ilikePattern}`,
  ];
  const phoneFilter = buildPhoneColumnOrFilter(["from_number", "to_number"], query.raw);
  if (phoneFilter) orParts.push(phoneFilter);

  const { data, error } = await supabase
    .from("fax_messages")
    .select(
      "id, sender_name, recipient_name, from_number, to_number, subject, status, note, created_at, updated_at, lead_id, patient_id, contact_id"
    )
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(PER_TABLE_LIMIT);

  if (error) {
    console.warn("[global-search] fax:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const matchedFields: string[] = [];
    if (query.isPhone) matchedFields.push("caller_number");
    if (row.sender_name?.toLowerCase().includes(query.lower)) matchedFields.push("caller_name");
    if (row.subject?.toLowerCase().includes(query.lower)) matchedFields.push("subject");
    if (matchedFields.length === 0) matchedFields.push("subject");

    const sourceTrail = buildFaxSourceTrail({
      hasLead: Boolean(row.lead_id),
      hasPatient: Boolean(row.patient_id),
    });

    return {
      type: "fax" as const,
      id: row.id,
      title: row.sender_name?.trim() || row.recipient_name?.trim() || row.subject?.trim() || "Fax",
      phone: formatPhoneForDisplay(row.from_number ?? row.to_number) || null,
      email: null,
      status: row.status?.replace(/_/g, " ") ?? null,
      source: resolvePrimarySourceLabel(sourceTrail),
      sourceTrail,
      matchedFields,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.updated_at,
      href: globalSearchHref("fax", row.id),
    };
  });
}

export async function searchApplicants(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<GlobalSearchResult[]> {
  const orParts = [
    `first_name.ilike.${query.ilikePattern}`,
    `last_name.ilike.${query.ilikePattern}`,
    `email.ilike.${query.ilikePattern}`,
  ];
  if (query.isPhone) {
    orParts.push(`phone.ilike.%${query.digits.slice(-10)}%`);
  } else {
    orParts.push(`phone.ilike.${query.ilikePattern}`);
  }

  const { data, error } = await supabase
    .from("applicants")
    .select("id, first_name, last_name, email, phone, status, created_at, updated_at")
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("[global-search] applicants:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    type: "applicant" as const,
    id: row.id,
    title: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || row.email || "Applicant",
    phone: formatPhoneForDisplay(row.phone) || null,
    email: row.email?.trim() || null,
    status: row.status?.replace(/_/g, " ") ?? null,
    source: "Hiring",
    sourceTrail: buildApplicantSourceTrail(),
    matchedFields: query.isPhone ? ["phone"] : query.isEmail ? ["email"] : ["name"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.updated_at,
    href: globalSearchHref("applicant", row.id),
  }));
}

export async function searchSignatureRecipients(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<GlobalSearchResult[]> {
  const { data, error } = await supabase
    .from("signature_recipients")
    .select("id, email, display_name, status, created_at, updated_at, packet_id")
    .or(`email.ilike.${query.ilikePattern},display_name.ilike.${query.ilikePattern}`)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("[global-search] signature_recipients:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    type: "packet" as const,
    id: row.packet_id,
    title: row.display_name?.trim() || row.email?.trim() || "Sign packet recipient",
    phone: null,
    email: row.email?.trim() || null,
    status: row.status?.replace(/_/g, " ") ?? null,
    source: "Saintly Sign",
    sourceTrail: ["Sign Packet", row.display_name?.trim() || "Recipient"].filter(Boolean),
    matchedFields: query.isEmail ? ["email"] : ["name"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.updated_at,
    href: globalSearchHref("packet", row.packet_id),
  }));
}

export async function searchRecruitingCandidates(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<GlobalSearchResult[]> {
  const orParts = [
    `full_name.ilike.${query.ilikePattern}`,
    `phone.ilike.${query.ilikePattern}`,
    `email.ilike.${query.ilikePattern}`,
    `notes.ilike.${query.ilikePattern}`,
  ];
  if (query.isPhone) {
    orParts.push(`normalized_phone.eq.${query.digits.slice(-10)}`);
    orParts.push(`phone.ilike.%${query.digits.slice(-10)}%`);
  }

  const { data, error } = await supabase
    .from("facebook_recruiting_leads")
    .select("id, full_name, phone, email, source, status, form_name, created_at, updated_at")
    .or(orParts.join(","))
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("[global-search] recruiting:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    type: "recruit" as const,
    id: row.id,
    title: row.full_name?.trim() || "Recruit",
    phone: formatPhoneForDisplay(row.phone) || null,
    email: row.email?.trim() || null,
    status: row.status?.replace(/_/g, " ") ?? null,
    source: row.source?.trim() || row.form_name?.trim() || null,
    sourceTrail: buildRecruitSourceTrail(row.source ?? row.form_name),
    matchedFields: query.isPhone ? ["phone"] : query.isEmail ? ["email"] : ["name"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.updated_at,
    href: globalSearchHref("recruit", row.id),
  }));
}

export async function searchConversations(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<GlobalSearchResult[]> {
  if (!query.isPhone) return [];

  const phoneFilter = buildPhoneColumnOrFilter(["main_phone_e164"], query.raw);
  if (!phoneFilter) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, main_phone_e164, lead_status, last_message_at, created_at, updated_at, primary_contact_id, contacts(full_name, first_name, last_name, email, primary_phone)"
    )
    .or(phoneFilter)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("[global-search] conversations:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    const title =
      contact?.full_name?.trim() ||
      [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() ||
      formatPhoneForDisplay(row.main_phone_e164) ||
      "SMS thread";

    return {
      type: "conversation" as const,
      id: row.id,
      title,
      phone: formatPhoneForDisplay(row.main_phone_e164) || null,
      email: contact?.email?.trim() || null,
      status: row.lead_status?.replace(/_/g, " ") ?? null,
      source: "SMS",
      sourceTrail: ["SMS Thread"],
      matchedFields: ["phone"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_message_at ?? row.updated_at,
      href: globalSearchHref("conversation", row.id),
    };
  });
}

export async function searchFacilities(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<GlobalSearchResult[]> {
  const orParts = [
    `name.ilike.${query.ilikePattern}`,
    `email.ilike.${query.ilikePattern}`,
    `referral_notes.ilike.${query.ilikePattern}`,
    `general_notes.ilike.${query.ilikePattern}`,
  ];
  const phoneFilter = buildPhoneColumnOrFilter(["main_phone", "fax"], query.raw);
  if (phoneFilter) orParts.push(phoneFilter);

  const { data, error } = await supabase
    .from("facilities")
    .select("id, name, main_phone, fax, email, territory, referral_method, created_at, updated_at")
    .or(orParts.join(","))
    .order("updated_at", { ascending: false })
    .limit(6);

  if (error) {
    console.warn("[global-search] facilities:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    type: "facility" as const,
    id: row.id,
    title: row.name?.trim() || "Facility",
    phone: formatPhoneForDisplay(row.main_phone ?? row.fax) || null,
    email: row.email?.trim() || null,
    status: row.referral_method?.replace(/_/g, " ") ?? null,
    source: row.territory?.trim() || "Referral source",
    sourceTrail: [row.referral_method?.trim() || "Facility", row.name?.trim() || "Facility"].filter(Boolean),
    matchedFields: query.isPhone ? ["phone"] : ["organization"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.updated_at,
    href: globalSearchHref("facility", row.id),
  }));
}

export async function searchCrmTasks(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<GlobalSearchResult[]> {
  if (query.isPhone) return [];

  const { data, error } = await supabase
    .from("crm_tasks")
    .select("id, title, description, status, source, due_at, created_at, updated_at, related_entity_type, related_entity_id")
    .or(
      `title.ilike.${query.ilikePattern},description.ilike.${query.ilikePattern},source.ilike.${query.ilikePattern}`
    )
    .order("updated_at", { ascending: false })
    .limit(6);

  if (error) {
    console.warn("[global-search] crm_tasks:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    let href = globalSearchHref("crm_task", row.id);
    if (row.related_entity_type === "lead" && row.related_entity_id) {
      href = globalSearchHref("lead", row.related_entity_id);
    } else if (row.related_entity_type === "patient" && row.related_entity_id) {
      href = globalSearchHref("patient", row.related_entity_id);
    }

    return {
      type: "crm_task" as const,
      id: row.id,
      title: row.title?.trim() || "CRM task",
      phone: null,
      email: null,
      status: row.status?.replace(/_/g, " ") ?? null,
      source: row.source?.trim() || null,
      sourceTrail: [row.source?.trim() || "Task", row.title?.trim() || "CRM Task"].filter(Boolean),
      matchedFields: row.title?.toLowerCase().includes(query.lower) ? ["title"] : ["description"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.due_at ?? row.updated_at,
      href,
    };
  });
}

export async function searchInboundEmails(
  supabase: SupabaseClient,
  query: ParsedGlobalSearchQuery
): Promise<GlobalSearchResult[]> {
  if (query.isPhone) return [];

  const { data, error } = await supabase
    .from("inbound_communications")
    .select(
      "id, from_email, from_name, subject, channel_key, review_state, created_at, updated_at, related_lead_id"
    )
    .or(
      `from_email.ilike.${query.ilikePattern},from_name.ilike.${query.ilikePattern},subject.ilike.${query.ilikePattern}`
    )
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    console.warn("[global-search] inbound_communications:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const href = row.related_lead_id
      ? globalSearchHref("lead", row.related_lead_id)
      : globalSearchHref("inbound_email", row.id);

    return {
      type: "inbound_email" as const,
      id: row.id,
      title: row.from_name?.trim() || row.from_email?.trim() || row.subject?.trim() || "Inbound email",
      phone: null,
      email: row.from_email?.trim() || null,
      status: row.review_state?.replace(/_/g, " ") ?? null,
      source: row.channel_key?.replace(/_/g, " ") ?? "Email",
      sourceTrail: buildInboundEmailSourceTrail(row.channel_key, Boolean(row.related_lead_id)),
      matchedFields: query.isEmail ? ["email"] : ["subject"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.updated_at,
      href,
    };
  });
}
