import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { handleNewLeadCreated } from "@/lib/crm/post-create-lead-workflow";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";
import { normalizeFaxNumberToE164, faxNumberSearchVariants } from "@/lib/fax/phone-numbers";

export const FAX_DOCUMENTS_BUCKET = "fax-documents";
export const SAINTLY_EXISTING_FAX_NUMBER = "+14803934119";

export type FaxCategory = "referral" | "orders" | "signed_docs" | "insurance" | "marketing" | "misc";
export type FaxPriority = "normal" | "urgent";

type JsonRecord = Record<string, unknown>;

export type FaxMessageRow = {
  id: string;
  telnyx_fax_id: string | null;
  direction: "inbound" | "outbound";
  status: string;
  from_number: string | null;
  to_number: string | null;
  fax_number_label: string | null;
  sender_name: string | null;
  recipient_name: string | null;
  subject: string | null;
  page_count: number | null;
  media_url: string | null;
  storage_path: string | null;
  pdf_url: string | null;
  thumbnail_url: string | null;
  assigned_to_user_id: string | null;
  lead_id: string | null;
  patient_id: string | null;
  facility_id: string | null;
  referral_source_id: string | null;
  contact_id: string | null;
  tags: string[];
  category: FaxCategory;
  priority: FaxPriority;
  is_read: boolean;
  is_archived: boolean;
  received_at: string | null;
  sent_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type FaxMatch = {
  lead_id?: string | null;
  patient_id?: string | null;
  facility_id?: string | null;
  referral_source_id?: string | null;
  contact_id?: string | null;
  sender_name?: string | null;
  recipient_name?: string | null;
  fax_number_label?: string | null;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Math.trunc(Number(value));
    }
  }
  return null;
}

function readIso(...values: unknown[]): string | null {
  const raw = readString(...values);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function eventPayload(body: unknown): JsonRecord {
  const root = asRecord(body);
  const data = asRecord(root.data);
  return asRecord(data.payload ?? data.record ?? data.object ?? data.attributes ?? root.payload ?? root);
}

export function telnyxEventType(body: unknown): string {
  const root = asRecord(body);
  const data = asRecord(root.data);
  return readString(data.event_type, root.event_type, data.type, root.type) ?? "fax.webhook";
}

export function extractTelnyxFax(body: unknown) {
  const payload = eventPayload(body);
  const root = asRecord(body);
  const data = asRecord(root.data);
  const directionRaw = readString(payload.direction, data.direction, root.direction)?.toLowerCase();
  const direction: "inbound" | "outbound" = directionRaw === "outbound" ? "outbound" : "inbound";
  const fromRaw = readString(payload.from, payload.from_number, payload.sender, data.from, root.from);
  const toRaw = readString(payload.to, payload.to_number, payload.recipient, data.to, root.to);

  return {
    telnyxFaxId: readString(payload.id, payload.fax_id, data.id, root.id),
    direction,
    status: readString(payload.status, data.status, root.status) ?? (direction === "inbound" ? "received" : "queued"),
    fromNumber: normalizeFaxNumberToE164(fromRaw) ?? fromRaw,
    toNumber: normalizeFaxNumberToE164(toRaw) ?? toRaw,
    mediaUrl: readString(payload.media_url, payload.original_media_url, payload.document_url, data.media_url, root.media_url),
    pageCount: readNumber(payload.page_count, payload.pages, data.page_count, root.page_count),
    receivedAt: readIso(payload.received_at, payload.created_at, data.created_at, root.created_at),
    sentAt: readIso(payload.sent_at, data.sent_at, root.sent_at),
    completedAt: readIso(payload.completed_at, data.completed_at, root.completed_at),
    failedAt: readIso(payload.failed_at, data.failed_at, root.failed_at),
    failureReason: readString(payload.failure_reason, payload.error, payload.error_message, data.failure_reason, root.failure_reason),
  };
}

export function normalizeFaxStatus(status: string | null | undefined, direction: "inbound" | "outbound"): string {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return direction === "inbound" ? "received" : "queued";
  if (["delivered", "delivery_delivered", "success"].includes(s)) return "delivered";
  if (["failed", "failure", "delivery_failed", "error"].includes(s)) return "failed";
  if (["sent", "sending", "queued", "received", "processing", "initiated"].includes(s)) return s;
  return s.replace(/[^a-z0-9_:-]/g, "_").slice(0, 64) || (direction === "inbound" ? "received" : "queued");
}

export async function signedFaxPdfUrl(storagePath: string | null | undefined): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(FAX_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function uploadFaxPdfFromUrl(input: {
  mediaUrl: string;
  telnyxFaxId: string;
  direction: "inbound" | "outbound";
}): Promise<{ storagePath: string | null; error?: string }> {
  try {
    const res = await fetch(input.mediaUrl, { cache: "no-store" });
    if (!res.ok) {
      return { storagePath: null, error: `PDF download failed (${res.status})` };
    }
    const contentType = res.headers.get("content-type") ?? "application/pdf";
    const bytes = await res.arrayBuffer();
    const safeId = input.telnyxFaxId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const storagePath = `${input.direction}/${new Date().toISOString().slice(0, 10)}/${safeId}.pdf`;
    const { error } = await supabaseAdmin.storage
      .from(FAX_DOCUMENTS_BUCKET)
      .upload(storagePath, bytes, {
        contentType: contentType.includes("pdf") ? contentType : "application/pdf",
        upsert: true,
      });
    if (error) {
      return { storagePath: null, error: error.message };
    }
    return { storagePath };
  } catch (err) {
    return { storagePath: null, error: err instanceof Error ? err.message : "PDF download failed" };
  }
}

export async function findFaxNumberMatch(number: string | null | undefined): Promise<FaxMatch> {
  const variants = faxNumberSearchVariants(number);
  if (variants.length === 0) return {};

  try {
    const { data: contactNumber } = await supabaseAdmin
      .from("fax_contact_numbers")
      .select("display_name, organization_name, lead_id, patient_id, facility_id, referral_source_id")
      .in("number_e164", variants)
      .limit(1)
      .maybeSingle();
    if (contactNumber) {
      const row = contactNumber as Record<string, string | null>;
      return {
        lead_id: row.lead_id,
        patient_id: row.patient_id,
        facility_id: row.facility_id,
        referral_source_id: row.referral_source_id,
        sender_name: row.display_name ?? row.organization_name,
        fax_number_label: row.organization_name ?? row.display_name,
      };
    }
  } catch {
    // Matching is helpful, never required for webhook success.
  }

  try {
    const { data: facility } = await supabaseAdmin
      .from("facilities")
      .select("id, name")
      .in("fax", variants)
      .limit(1)
      .maybeSingle();
    if (facility?.id) {
      return {
        facility_id: facility.id as string,
        sender_name: (facility.name as string | null) ?? null,
        fax_number_label: "Facility",
      };
    }
  } catch {}

  try {
    const { data: facilityContact } = await supabaseAdmin
      .from("facility_contacts")
      .select("facility_id, full_name, first_name, last_name")
      .in("fax", variants)
      .limit(1)
      .maybeSingle();
    if (facilityContact?.facility_id) {
      const fullName =
        (facilityContact.full_name as string | null) ??
        [facilityContact.first_name, facilityContact.last_name].filter(Boolean).join(" ");
      return {
        facility_id: facilityContact.facility_id as string,
        sender_name: fullName || null,
        fax_number_label: "Facility contact",
      };
    }
  } catch {}

  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, contact_id, doctor_office_name, referring_provider_name")
      .in("doctor_office_fax", variants)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lead?.id) {
      return {
        lead_id: lead.id as string,
        contact_id: (lead.contact_id as string | null) ?? null,
        sender_name: (lead.doctor_office_name as string | null) ?? (lead.referring_provider_name as string | null) ?? null,
        fax_number_label: "Lead referral fax",
      };
    }
  } catch {}

  try {
    const { data: patient } = await supabaseAdmin
      .from("patients")
      .select("id, contact_id, doctor_office_name, referring_provider_name")
      .in("doctor_office_fax", variants)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (patient?.id) {
      return {
        patient_id: patient.id as string,
        contact_id: (patient.contact_id as string | null) ?? null,
        sender_name:
          (patient.doctor_office_name as string | null) ?? (patient.referring_provider_name as string | null) ?? null,
        fax_number_label: "Patient referral fax",
      };
    }
  } catch {}

  return {};
}

export async function recordFaxEvent(input: {
  faxMessageId: string;
  eventType: string;
  payload?: unknown;
}) {
  await supabaseAdmin.from("fax_events").insert({
    fax_message_id: input.faxMessageId,
    event_type: input.eventType,
    payload: asRecord(input.payload),
  });
}

export async function upsertInboundFaxFromWebhook(body: unknown): Promise<{ ok: boolean; faxId?: string; error?: string }> {
  const fax = extractTelnyxFax(body);
  if (!fax.telnyxFaxId) {
    return { ok: false, error: "Missing Telnyx fax id" };
  }

  const match = await findFaxNumberMatch(fax.fromNumber);
  const upload =
    fax.mediaUrl && fax.status !== "failed"
      ? await uploadFaxPdfFromUrl({
          mediaUrl: fax.mediaUrl,
          telnyxFaxId: fax.telnyxFaxId,
          direction: "inbound",
        })
      : { storagePath: null };

  const { data, error } = await supabaseAdmin
    .from("fax_messages")
    .upsert(
      {
        telnyx_fax_id: fax.telnyxFaxId,
        direction: "inbound",
        status: normalizeFaxStatus(fax.status, "inbound"),
        from_number: fax.fromNumber,
        to_number: fax.toNumber,
        media_url: fax.mediaUrl,
        storage_path: upload.storagePath,
        page_count: fax.pageCount,
        received_at: fax.receivedAt ?? new Date().toISOString(),
        completed_at: fax.completedAt,
        failed_at: fax.failedAt,
        failure_reason: fax.failureReason ?? upload.error ?? null,
        category: match.facility_id || match.lead_id ? "referral" : "misc",
        ...match,
      },
      { onConflict: "telnyx_fax_id" }
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    return { ok: false, error: error?.message ?? "Fax upsert failed" };
  }

  await recordFaxEvent({
    faxMessageId: data.id as string,
    eventType: telnyxEventType(body),
    payload: body,
  });

  return { ok: true, faxId: data.id as string };
}

export async function updateFaxFromStatusWebhook(body: unknown): Promise<{ ok: boolean; faxId?: string; error?: string }> {
  const fax = extractTelnyxFax(body);
  if (!fax.telnyxFaxId) return { ok: false, error: "Missing Telnyx fax id" };

  const status = normalizeFaxStatus(fax.status, fax.direction);
  const patch: Record<string, unknown> = {
    status,
    page_count: fax.pageCount,
    completed_at: fax.completedAt,
    failed_at: status === "failed" ? fax.failedAt ?? new Date().toISOString() : fax.failedAt,
    failure_reason: fax.failureReason,
  };
  if (status === "sent" || status === "delivered") {
    patch.sent_at = fax.sentAt ?? fax.completedAt ?? new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from("fax_messages")
    .update(patch)
    .eq("telnyx_fax_id", fax.telnyxFaxId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "Fax message not found" };

  await recordFaxEvent({
    faxMessageId: data.id as string,
    eventType: telnyxEventType(body),
    payload: body,
  });
  return { ok: true, faxId: data.id as string };
}

export async function createReferralLeadFromFax(input: {
  faxId: string;
  firstName: string;
  lastName: string;
  dob?: string | null;
  phone?: string | null;
  address?: string | null;
  insurance?: string | null;
  doctor?: string | null;
  notes?: string | null;
  actorUserId: string | null;
}): Promise<{ ok: boolean; leadId?: string; error?: string }> {
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
  if (!input.firstName.trim() || !input.lastName.trim()) {
    return { ok: false, error: "Patient first and last name are required." };
  }

  const { data: contact, error: contactError } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      full_name: fullName,
      primary_phone: input.phone?.replace(/\D/g, "") || null,
      address_line_1: input.address?.trim() || null,
      contact_type: "lead",
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (contactError || !contact?.id) return { ok: false, error: contactError?.message ?? "Contact insert failed" };

  const { data: fax } = await supabaseAdmin
    .from("fax_messages")
    .select("from_number, sender_name, fax_number_label, storage_path")
    .eq("id", input.faxId)
    .maybeSingle();

  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .insert({
      contact_id: contact.id,
      source: "other",
      status: "new",
      dob: input.dob || null,
      referral_source: "Fax Center",
      referring_doctor_name: input.doctor?.trim() || null,
      doctor_office_name: ((fax?.sender_name as string | null) ?? (fax?.fax_number_label as string | null)) || null,
      doctor_office_fax: normalizeFaxNumberToE164(fax?.from_number as string | null),
      payer_name: input.insurance?.trim() || null,
      notes: [input.notes?.trim(), fax?.storage_path ? `Created from fax document ${fax.storage_path}.` : null]
        .filter(Boolean)
        .join("\n\n"),
      external_source_metadata: {
        fax_message_id: input.faxId,
        created_by_user_id: input.actorUserId,
      },
    })
    .select("id")
    .single();

  if (leadError || !lead?.id) {
    await supabaseAdmin.from("contacts").delete().eq("id", contact.id);
    return { ok: false, error: leadError?.message ?? "Lead insert failed" };
  }

  await handleNewLeadCreated(supabaseAdmin, {
    leadId: lead.id as string,
    contactId: contact.id as string,
    intakeChannel: "manual_crm",
  });

  await supabaseAdmin
    .from("fax_messages")
    .update({
      lead_id: lead.id,
      contact_id: contact.id,
      category: "referral",
      is_read: true,
    })
    .eq("id", input.faxId);

  await recordFaxEvent({
    faxMessageId: input.faxId,
    eventType: "lead_created_from_fax",
    payload: { lead_id: lead.id, created_by_user_id: input.actorUserId },
  });

  return { ok: true, leadId: lead.id as string };
}

export function missingFaxSchema(error: { message?: string; code?: string } | null | undefined): boolean {
  return isMissingSchemaObjectError(error);
}
