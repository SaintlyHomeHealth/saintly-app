import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { contactDirectoryDisplayName } from "@/lib/crm/contact-directory";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import type { PrivatePayRecipient, PrivatePayRecipientSearchResult } from "@/lib/private-pay/types";

type ContactRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  primary_phone: string | null;
  email: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function formatContactAddress(c: ContactRow): string {
  return [
    (c.address_line_1 ?? "").trim(),
    (c.address_line_2 ?? "").trim(),
    [
      (c.city ?? "").trim(),
      [(c.state ?? "").trim(), (c.zip ?? "").trim()].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(", ");
}

function buildBilling(c: ContactRow) {
  return {
    name: contactDirectoryDisplayName(c),
    email: (c.email ?? "").trim(),
    phone: (c.primary_phone ?? "").trim(),
    address: formatContactAddress(c),
  };
}

function matchesQuery(c: ContactRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return false;
  const name = contactDirectoryDisplayName(c).toLowerCase();
  const email = (c.email ?? "").toLowerCase();
  const phone = (c.primary_phone ?? "").toLowerCase();
  const needleDigits = normalizePhone(q);
  const phoneDigits = normalizePhone(c.primary_phone ?? "");
  if (needleDigits && phoneDigits.includes(needleDigits)) return true;
  return name.includes(needle) || email.includes(needle) || phone.includes(needle);
}

const CONTACT_SELECT =
  "id, full_name, first_name, last_name, organization_name, primary_phone, email, address_line_1, address_line_2, city, state, zip";

export async function searchPrivatePayRecipients(query: string): Promise<PrivatePayRecipientSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { contacts: [], patients: [], leads: [] };
  }

  const { data: contactRows } = await supabaseAdmin
    .from("contacts")
    .select(CONTACT_SELECT)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(400);

  const contactsAll = (contactRows ?? []) as ContactRow[];
  const matchedContacts = contactsAll.filter((c) => matchesQuery(c, q)).slice(0, 12);
  const matchedContactIds = new Set(matchedContacts.map((c) => c.id));

  const [{ data: patientRows }, { data: leadRows }] = await Promise.all([
    supabaseAdmin
      .from("patients")
      .select(`id, contact_id, contacts (${CONTACT_SELECT})`)
      .is("archived_at", null)
      .limit(400),
    leadRowsActiveOnly(
      supabaseAdmin
        .from("leads")
        .select(`id, contact_id, status, contacts (${CONTACT_SELECT})`)
        .order("created_at", { ascending: false })
        .limit(400)
    ),
  ]);

  const contacts: PrivatePayRecipient[] = matchedContacts.map((c) => ({
    contact_id: c.id,
    patient_id: null,
    lead_id: null,
    kind: "contact",
    label: contactDirectoryDisplayName(c),
    billing: buildBilling(c),
  }));

  const patients: PrivatePayRecipient[] = [];
  for (const row of patientRows ?? []) {
    const patientId = String((row as { id: string }).id);
    const contactId = String((row as { contact_id: string }).contact_id ?? "");
    const cr = (row as { contacts: ContactRow | ContactRow[] | null }).contacts;
    const c = Array.isArray(cr) ? cr[0] : cr;
    if (!c || !contactId) continue;
    if (!matchedContactIds.has(contactId) && !matchesQuery(c, q)) continue;
    patients.push({
      contact_id: contactId,
      patient_id: patientId,
      lead_id: null,
      kind: "patient",
      label: contactDirectoryDisplayName(c),
      billing: buildBilling(c),
    });
    if (patients.length >= 12) break;
  }

  const leads: PrivatePayRecipient[] = [];
  for (const row of leadRows ?? []) {
    const leadId = String((row as { id: string }).id);
    const contactId = String((row as { contact_id: string }).contact_id ?? "");
    const status = String((row as { status?: string }).status ?? "").trim();
    const cr = (row as { contacts: ContactRow | ContactRow[] | null }).contacts;
    const c = Array.isArray(cr) ? cr[0] : cr;
    if (!c || !contactId) continue;
    if (!matchedContactIds.has(contactId) && !matchesQuery(c, q)) continue;
    const name = contactDirectoryDisplayName(c);
    leads.push({
      contact_id: contactId,
      patient_id: null,
      lead_id: leadId,
      kind: "lead",
      label: status ? `${name} (${status})` : name,
      billing: buildBilling(c),
    });
    if (leads.length >= 12) break;
  }

  return { contacts, patients, leads };
}

export async function resolvePrivatePayRecipient(opts: {
  contact_id: string;
  patient_id?: string | null;
  lead_id?: string | null;
}): Promise<PrivatePayRecipient | null> {
  const contactId = opts.contact_id.trim();
  if (!contactId) return null;

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return null;
  const c = contact as ContactRow;

  let patientId = opts.patient_id?.trim() || null;
  let leadId = opts.lead_id?.trim() || null;
  let kind: PrivatePayRecipient["kind"] = "contact";

  if (patientId) {
    kind = "patient";
  } else if (leadId) {
    kind = "lead";
  } else {
    const { data: patient } = await supabaseAdmin
      .from("patients")
      .select("id")
      .eq("contact_id", contactId)
      .maybeSingle();
    if (patient?.id) {
      patientId = String(patient.id);
      kind = "patient";
    }
  }

  return {
    contact_id: contactId,
    patient_id: patientId,
    lead_id: leadId,
    kind,
    label: contactDirectoryDisplayName(c),
    billing: buildBilling(c),
  };
}
