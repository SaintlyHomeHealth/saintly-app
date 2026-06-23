import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import type { FaxPacketMetadata } from "@/lib/fax/fax-cover-template-types";
import type { FaxClonePrefill } from "@/lib/fax/fax-clone-prefill-types";
import { formatDateOfBirthInput } from "@/lib/fax/format-date-of-birth-input";
import { formatFaxPhoneDisplay } from "@/lib/fax/format-fax-phone-display";
import { SAINTLY_EXISTING_FAX_NUMBER, type FaxMessageRow } from "@/lib/fax/fax-service";

type NoteParse = {
  patientName?: string;
  patientDob?: string;
  patientMedicareNumber?: string;
};

function textOrEmpty(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function pickFirst(...values: unknown[]): string {
  for (const value of values) {
    const text = textOrEmpty(value);
    if (text) return text;
  }
  return "";
}

function isoDobToFaxInput(value: string): string {
  const raw = value.trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return formatDateOfBirthInput(`${iso[2]}${iso[3]}${iso[1]}`);
  }
  return formatDateOfBirthInput(raw);
}

function parseFaxNote(note: string | null | undefined): NoteParse {
  if (!note?.trim()) return {};
  const patientMatch = note.match(/Patient:\s*([^\.]+?)(?:\.|$)/i);
  const dobMatch = note.match(/DOB:\s*([^\.]+?)(?:\.|$)/i);
  const medicareMatch = note.match(/(?:Medicare|Member(?:\s*(?:#|number))?):\s*([^\.]+?)(?:\.|$)/i);
  return {
    patientName: patientMatch?.[1]?.trim(),
    patientDob: dobMatch?.[1]?.trim(),
    patientMedicareNumber: medicareMatch?.[1]?.trim(),
  };
}

function splitRecipientName(recipientName: string | null | undefined): { name: string; org: string } {
  const raw = textOrEmpty(recipientName);
  if (!raw) return { name: "", org: "" };
  const sep = raw.indexOf(" · ");
  if (sep === -1) return { name: raw, org: "" };
  return {
    name: raw.slice(0, sep).trim(),
    org: raw.slice(sep + 3).trim(),
  };
}

function readPacketMetadata(row: FaxMessageRow): FaxPacketMetadata {
  const raw = row.packet_metadata;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as FaxPacketMetadata;
}

function readFaxMetadata(row: FaxMessageRow): Record<string, unknown> {
  const extended = row as FaxMessageRow & {
    fax_metadata?: Record<string, unknown> | null;
    patient_name?: string | null;
    patient_dob?: string | null;
    patient_medicare_number?: string | null;
    recipient_phone?: string | null;
    recipient_contact_id?: string | null;
    template_type?: string | null;
  };
  const raw = extended.fax_metadata;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

function contactDisplayName(contact: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const full = textOrEmpty(contact.full_name);
  if (full) return full;
  return [contact.first_name, contact.last_name].filter((p) => textOrEmpty(p)).join(" ").trim();
}

export async function getFaxClonePrefill(
  faxId: string
): Promise<{ ok: true; prefill: FaxClonePrefill } | { ok: false; error: string }> {
  const id = faxId.trim();
  if (!id) return { ok: false, error: "Missing fax." };

  const { data, error } = await supabaseAdmin.from("fax_messages").select("*").eq("id", id).maybeSingle();
  if (error || !data?.id) {
    return { ok: false, error: "Fax not found." };
  }

  const row = data as FaxMessageRow & {
    patient_name?: string | null;
    patient_dob?: string | null;
    patient_medicare_number?: string | null;
    recipient_phone?: string | null;
    recipient_contact_id?: string | null;
    template_type?: string | null;
    fax_metadata?: Record<string, unknown> | null;
  };

  if (row.direction !== "outbound") {
    return { ok: false, error: "Only outbound faxes can be cloned for a new document." };
  }

  const packetMeta = readPacketMetadata(row);
  const faxMeta = readFaxMetadata(row);
  const noteParsed = parseFaxNote(row.note);
  const splitRecipient = splitRecipientName(row.recipient_name);

  let patientContactName = "";
  let patientContactDob = "";
  let patientMedicare = "";
  const recipientContactId = pickFirst(
    row.recipient_contact_id,
    row.contact_id,
    faxMeta.recipient_contact_id
  );

  if (row.patient_id) {
    const { data: patientRow } = await supabaseAdmin
      .from("patients")
      .select(
        `
        id,
        medicare_number,
        contacts (
          full_name,
          first_name,
          last_name,
          date_of_birth
        )
      `
      )
      .eq("id", row.patient_id)
      .maybeSingle();

    if (patientRow?.id) {
      const cr = patientRow.contacts as
        | { full_name?: string | null; first_name?: string | null; last_name?: string | null; date_of_birth?: string | null }
        | { full_name?: string | null; first_name?: string | null; last_name?: string | null; date_of_birth?: string | null }[]
        | null;
      const contact = Array.isArray(cr) ? cr[0] : cr;
      if (contact) {
        patientContactName = contactDisplayName(contact);
        patientContactDob = textOrEmpty(contact.date_of_birth);
      }
      patientMedicare = textOrEmpty(patientRow.medicare_number);
    }
  }

  let recipientContactName = "";
  let recipientContactPhone = "";
  if (recipientContactId) {
    const { data: contactRow } = await supabaseAdmin
      .from("contacts")
      .select("full_name, first_name, last_name, primary_phone, secondary_phone")
      .eq("id", recipientContactId)
      .maybeSingle();
    if (contactRow) {
      recipientContactName = contactDisplayName(contactRow);
      recipientContactPhone = pickFirst(contactRow.primary_phone, contactRow.secondary_phone);
    }
  }

  const patientName = pickFirst(
    row.patient_name,
    packetMeta.patient_name,
    faxMeta.patient_name,
    noteParsed.patientName,
    patientContactName
  );

  const patientDobRaw = pickFirst(
    row.patient_dob,
    packetMeta.patient_dob,
    faxMeta.patient_dob,
    noteParsed.patientDob,
    patientContactDob
  );

  const patientMedicareNumber = pickFirst(
    row.patient_medicare_number,
    faxMeta.patient_medicare_number,
    faxMeta.member_number,
    noteParsed.patientMedicareNumber,
    patientMedicare
  );

  const recipientName = pickFirst(splitRecipient.name, recipientContactName);
  const recipientOrganization = pickFirst(
    packetMeta.recipient_organization,
    faxMeta.recipient_organization,
    splitRecipient.org
  );

  const recipientFax = formatFaxPhoneDisplay(
    pickFirst(row.to_number, packetMeta.recipient_fax, faxMeta.recipient_fax)
  );

  const recipientPhone = formatFaxPhoneDisplay(
    pickFirst(row.recipient_phone, packetMeta.recipient_phone, faxMeta.recipient_phone, recipientContactPhone)
  );

  const fromFaxNumber = formatFaxPhoneDisplay(pickFirst(row.from_number, SAINTLY_EXISTING_FAX_NUMBER));

  const prefill: FaxClonePrefill = {
    sourceFaxId: row.id,
    recipientName,
    recipientOrganization,
    recipientFax,
    recipientPhone,
    patientName,
    patientDob: patientDobRaw ? isoDobToFaxInput(patientDobRaw) : "",
    patientMedicareNumber,
    patientId: row.patient_id ?? null,
    recipientContactId: recipientContactId || null,
    fromFaxNumber,
    priorCoverSheetTemplateId: row.cover_sheet_template_id ?? packetMeta.cover_sheet_template_id ?? null,
    priorDocumentTemplateId: packetMeta.document_template_id ?? null,
    templateType: textOrEmpty(row.template_type) || textOrEmpty(faxMeta.template_type) || null,
  };

  return { ok: true, prefill };
}
