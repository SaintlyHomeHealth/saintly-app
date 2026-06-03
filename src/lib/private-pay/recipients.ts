import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { contactDirectoryDisplayName } from "@/lib/crm/contact-directory";
import { labelForContactType } from "@/lib/crm/contact-types";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { validatePrivatePayCustomerInput } from "@/lib/private-pay/customer-input";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import type {
  PrivatePayCustomerInput,
  PrivatePayRecipient,
  PrivatePayRecipientSearchResult,
} from "@/lib/private-pay/types";

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
  contact_type?: string | null;
};

function recipientLabel(c: ContactRow, kind: PrivatePayRecipient["kind"], status?: string): string {
  const name = contactDirectoryDisplayName(c);
  if (kind === "lead" && status) return `${name} (${status})`;
  if ((c.contact_type ?? "").trim() === "private_pay") {
    return `${name} · ${labelForContactType("private_pay")}`;
  }
  return name;
}

function contactToRecipient(c: ContactRow, opts: { kind: PrivatePayRecipient["kind"]; patient_id?: string | null; lead_id?: string | null; status?: string }): PrivatePayRecipient {
  return {
    contact_id: c.id,
    patient_id: opts.patient_id ?? null,
    lead_id: opts.lead_id ?? null,
    kind: opts.kind,
    label: recipientLabel(c, opts.kind, opts.status),
    billing: buildBilling(c),
  };
}

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
  "id, full_name, first_name, last_name, organization_name, primary_phone, email, address_line_1, address_line_2, city, state, zip, contact_type";

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

  const contacts: PrivatePayRecipient[] = matchedContacts.map((c) =>
    contactToRecipient(c, { kind: "contact" })
  );

  const patients: PrivatePayRecipient[] = [];
  for (const row of patientRows ?? []) {
    const patientId = String((row as { id: string }).id);
    const contactId = String((row as { contact_id: string }).contact_id ?? "");
    const cr = (row as { contacts: ContactRow | ContactRow[] | null }).contacts;
    const c = Array.isArray(cr) ? cr[0] : cr;
    if (!c || !contactId) continue;
    if (!matchedContactIds.has(contactId) && !matchesQuery(c, q)) continue;
    patients.push(contactToRecipient(c, { kind: "patient", patient_id: patientId }));
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
    leads.push(contactToRecipient(c, { kind: "lead", lead_id: leadId, status }));
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

  return contactToRecipient(c, { kind, patient_id: patientId, lead_id: leadId });
}

export type CreatePrivatePayCustomerResult =
  | { ok: true; recipient: PrivatePayRecipient }
  | { ok: false; error: string; duplicate_recipient?: PrivatePayRecipient };

/** Create a walk-in private-pay client as a CRM contact (no patient/lead required). */
export async function createPrivatePayCustomer(
  input: PrivatePayCustomerInput,
  createdByUserId: string | null
): Promise<CreatePrivatePayCustomerResult> {
  const validated = validatePrivatePayCustomerInput(input);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const n = validated.normalized;
  const e164 = `+1${n.phone}`;

  const existing = await findContactByIncomingPhone(supabaseAdmin, e164);
  if (existing?.id) {
    const duplicate = await resolvePrivatePayRecipient({ contact_id: existing.id });
    return {
      ok: false,
      error: "A contact with this phone number already exists. Select them from search instead.",
      duplicate_recipient: duplicate ?? undefined,
    };
  }

  const full_name = [n.first_name, n.last_name].filter(Boolean).join(" ").trim();
  const email = n.email || null;

  const { data: inserted, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: n.first_name || null,
      last_name: n.last_name || null,
      full_name: full_name || null,
      primary_phone: e164,
      email,
      address_line_1: n.address_line_1 || null,
      address_line_2: n.address_line_2 || null,
      city: n.city || null,
      state: n.state || null,
      zip: n.zip || null,
      notes: n.notes || null,
      contact_type: "private_pay",
      referral_source: "Private Pay",
      status: "active",
      owner_user_id: createdByUserId,
      relationship_metadata: { private_pay_client: true, created_via: "private_pay_billing" },
    })
    .select(CONTACT_SELECT)
    .single();

  if (error || !inserted?.id) {
    return { ok: false, error: error?.message ?? "Failed to create customer." };
  }

  const c = inserted as ContactRow;
  return {
    ok: true,
    recipient: contactToRecipient(c, { kind: "contact" }),
  };
}
