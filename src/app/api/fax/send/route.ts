import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import type { FaxPacketMetadata } from "@/lib/fax/fax-cover-template-types";
import { SAINTLY_EXISTING_FAX_NUMBER, type FaxCategory } from "@/lib/fax/fax-service";
import {
  callTelnyxSendFax,
  resolveOutboundSendMedia,
  TelnyxFaxError,
  telnyxFaxConnectionId,
  type OutboundSendMediaInput,
} from "@/lib/fax/outbound-fax-telnyx";
import { normalizeFaxNumberToE164 } from "@/lib/fax/phone-numbers";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set<FaxCategory>([
  "referral",
  "orders",
  "signed_docs",
  "insurance",
  "marketing",
  "misc",
]);

type SendFaxInput = {
  to_number: string | null;
  from_number: string | null;
  media_url: string | null;
  storage_path: string | null;
  file: File | null;
  subject: string | null;
  recipient_name: string | null;
  lead_id: string | null;
  patient_id: string | null;
  facility_id: string | null;
  referral_source_id: string | null;
  contact_id: string | null;
  patient_name: string | null;
  patient_dob: string | null;
  patient_medicare_number: string | null;
  recipient_phone: string | null;
  recipient_contact_id: string | null;
  template_type: string | null;
  fax_metadata: Record<string, unknown> | null;
  category: FaxCategory;
  tags: string[];
  cover_sheet_template_id: string | null;
  packet_metadata: FaxPacketMetadata | null;
  page_count: number | null;
  note: string | null;
};

type OutboundFaxDebug = {
  from_number: string | null;
  to_number: string | null;
  media_url_exists: boolean;
  storage_path_exists: boolean;
  telnyx_response_status?: number | null;
  telnyx_error_code?: string | null;
  telnyx_error_message?: string | null;
  telnyx_api_key_configured?: boolean;
  connection_id_configured?: boolean;
};

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseCategory(value: unknown): FaxCategory {
  const raw = textOrNull(value);
  return raw && VALID_CATEGORIES.has(raw as FaxCategory) ? (raw as FaxCategory) : "misc";
}

function parsePacketMetadata(value: unknown): FaxPacketMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const pick = (key: keyof FaxPacketMetadata) => {
    const v = o[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const meta: FaxPacketMetadata = {
    recipient_organization: pick("recipient_organization"),
    recipient_phone: pick("recipient_phone"),
    recipient_fax: pick("recipient_fax"),
    patient_name: pick("patient_name"),
    patient_dob: pick("patient_dob"),
    message: pick("message"),
    cover_sheet_template_id: pick("cover_sheet_template_id"),
    cover_sheet_template_name: pick("cover_sheet_template_name"),
    document_template_id: pick("document_template_id"),
    document_template_name: pick("document_template_name"),
  };
  const hasValue = Object.values(meta).some(Boolean);
  return hasValue ? meta : null;
}

function parseFaxMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parsePageCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
      .map((tag) => tag.trim());
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function safeDebugMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return message.replace(/https:\/\/\S+/g, "[redacted_https_url]");
}

function logOutboundFaxDebug(event: string, debug: OutboundFaxDebug) {
  console.info("[fax/send]", {
    event,
    from_number: debug.from_number,
    to_number: debug.to_number,
    media_url_exists: debug.media_url_exists,
    storage_path_exists: debug.storage_path_exists,
    telnyx_response_status: debug.telnyx_response_status ?? null,
    telnyx_error_code: debug.telnyx_error_code ?? null,
    telnyx_error_message: safeDebugMessage(debug.telnyx_error_message),
    telnyx_api_key_configured: debug.telnyx_api_key_configured,
    connection_id_configured: debug.connection_id_configured,
  });
}

async function parseInput(req: NextRequest): Promise<SendFaxInput> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = (await req.formData() as unknown) as globalThis.FormData;
    const fileValue = formData.get("file");
    return {
      to_number: textOrNull(formData.get("to_number")),
      from_number: textOrNull(formData.get("from_number")),
      media_url: textOrNull(formData.get("media_url")),
      storage_path: textOrNull(formData.get("storage_path")),
      file: fileValue instanceof File && fileValue.size > 0 ? fileValue : null,
      subject: textOrNull(formData.get("subject")),
      recipient_name: textOrNull(formData.get("recipient_name")),
      lead_id: textOrNull(formData.get("lead_id")),
      patient_id: textOrNull(formData.get("patient_id")),
      facility_id: textOrNull(formData.get("facility_id")),
      referral_source_id: textOrNull(formData.get("referral_source_id")),
      contact_id: textOrNull(formData.get("contact_id")),
      patient_name: textOrNull(formData.get("patient_name")),
      patient_dob: textOrNull(formData.get("patient_dob")),
      patient_medicare_number: textOrNull(formData.get("patient_medicare_number")),
      recipient_phone: textOrNull(formData.get("recipient_phone")),
      recipient_contact_id: textOrNull(formData.get("recipient_contact_id")),
      template_type: textOrNull(formData.get("template_type")),
      fax_metadata: parseFaxMetadata(
        (() => {
          const raw = formData.get("fax_metadata");
          if (typeof raw !== "string" || !raw.trim()) return null;
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      ),
      category: parseCategory(formData.get("category")),
      tags: parseTags(formData.get("tags")),
      cover_sheet_template_id: textOrNull(formData.get("cover_sheet_template_id")),
      packet_metadata: parsePacketMetadata(
        (() => {
          const raw = formData.get("packet_metadata");
          if (typeof raw !== "string" || !raw.trim()) return null;
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      ),
      page_count: parsePageCount(formData.get("page_count")),
      note: textOrNull(formData.get("note")),
    };
  }

  const json = (await req.json()) as Record<string, unknown>;
  return {
    to_number: textOrNull(json.to_number ?? json.to),
    from_number: textOrNull(json.from_number ?? json.from),
    media_url: textOrNull(json.media_url ?? json.pdf_url),
    storage_path: textOrNull(json.storage_path),
    file: null,
    subject: textOrNull(json.subject),
    recipient_name: textOrNull(json.recipient_name),
    lead_id: textOrNull(json.lead_id),
    patient_id: textOrNull(json.patient_id),
    facility_id: textOrNull(json.facility_id),
    referral_source_id: textOrNull(json.referral_source_id),
    contact_id: textOrNull(json.contact_id),
    patient_name: textOrNull(json.patient_name),
    patient_dob: textOrNull(json.patient_dob),
    patient_medicare_number: textOrNull(json.patient_medicare_number),
    recipient_phone: textOrNull(json.recipient_phone),
    recipient_contact_id: textOrNull(json.recipient_contact_id),
    template_type: textOrNull(json.template_type),
    fax_metadata: parseFaxMetadata(json.fax_metadata),
    category: parseCategory(json.category),
    tags: parseTags(json.tags),
    cover_sheet_template_id: textOrNull(json.cover_sheet_template_id),
    packet_metadata: parsePacketMetadata(json.packet_metadata),
    page_count: parsePageCount(json.page_count),
    note: textOrNull(json.note),
  };
}

function pickMediaInput(input: SendFaxInput): OutboundSendMediaInput {
  return {
    file: input.file,
    storage_path: input.storage_path,
    media_url: input.media_url,
  };
}

export async function POST(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let input: SendFaxInput;
  try {
    input = await parseInput(req);
  } catch {
    return NextResponse.json({ error: "Invalid fax send request." }, { status: 400 });
  }

  const toNumber = normalizeFaxNumberToE164(input.to_number);
  const fromNumber = normalizeFaxNumberToE164(input.from_number) ?? SAINTLY_EXISTING_FAX_NUMBER;
  const baseDebug: OutboundFaxDebug = {
    from_number: fromNumber,
    to_number: toNumber,
    media_url_exists: Boolean(input.media_url),
    storage_path_exists: Boolean(input.storage_path),
    telnyx_api_key_configured: Boolean(process.env.TELNYX_API_KEY?.trim()),
    connection_id_configured: Boolean(process.env.TELNYX_FAX_CONNECTION_ID?.trim()),
  };
  logOutboundFaxDebug("request_received", baseDebug);
  if (!toNumber) {
    return NextResponse.json({ error: "Enter a valid destination fax number." }, { status: 400 });
  }
  let connectionId: string;
  try {
    connectionId = telnyxFaxConnectionId();
  } catch (err) {
    const message = err instanceof Error ? err.message : "TELNYX_FAX_CONNECTION_ID is not configured.";
    logOutboundFaxDebug("configuration_error", {
      ...baseDebug,
      telnyx_error_message: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const tags = [...new Set([...input.tags, ...(input.cover_sheet_template_id ? ["fax_packet"] : [])])];

  const insertPayload: Record<string, unknown> = {
    direction: "outbound",
    status: "queued",
    from_number: fromNumber,
    to_number: toNumber,
    subject: input.subject,
    recipient_name: input.recipient_name,
    lead_id: input.lead_id,
    patient_id: input.patient_id,
    facility_id: input.facility_id,
    referral_source_id: input.referral_source_id,
    contact_id: input.contact_id,
    patient_name: input.patient_name,
    patient_dob: input.patient_dob,
    patient_medicare_number: input.patient_medicare_number,
    recipient_phone: input.recipient_phone,
    recipient_contact_id: input.recipient_contact_id,
    template_type: input.template_type,
    category: input.category,
    tags,
    note: input.note,
    page_count: input.page_count,
    assigned_to_user_id: staff.user_id,
  };
  if (input.fax_metadata) {
    insertPayload.fax_metadata = input.fax_metadata;
  }
  if (input.cover_sheet_template_id) {
    insertPayload.cover_sheet_template_id = input.cover_sheet_template_id;
  }
  if (input.packet_metadata) {
    insertPayload.packet_metadata = input.packet_metadata;
  }

  const cloneMetadataKeys = [
    "patient_name",
    "patient_dob",
    "patient_medicare_number",
    "recipient_phone",
    "recipient_contact_id",
    "template_type",
    "fax_metadata",
  ] as const;

  function isMissingCloneMetadataColumn(message: string | undefined): boolean {
    const m = (message ?? "").toLowerCase();
    return cloneMetadataKeys.some((key) => m.includes(key) && m.includes("column"));
  }

  let insertResult = await supabaseAdmin.from("fax_messages").insert(insertPayload).select("id").single();
  if (insertResult.error && isMissingCloneMetadataColumn(insertResult.error.message)) {
    for (const key of cloneMetadataKeys) {
      delete insertPayload[key];
    }
    insertResult = await supabaseAdmin.from("fax_messages").insert(insertPayload).select("id").single();
  }
  const faxRow = insertResult.data;
  const insertError = insertResult.error;
  if (insertError || !faxRow?.id) {
    return NextResponse.json({ error: "Could not create outbound fax record." }, { status: 500 });
  }

  try {
    const resolved = await resolveOutboundSendMedia(pickMediaInput(input), faxRow.id as string);
    logOutboundFaxDebug("media_resolved", {
      ...baseDebug,
      media_url_exists: Boolean(resolved.mediaUrl),
      storage_path_exists: Boolean(resolved.storagePath),
    });
    const telnyx = await callTelnyxSendFax({
      to: toNumber,
      from: fromNumber,
      mediaUrl: resolved.mediaUrl,
      connectionId,
    });
    logOutboundFaxDebug("telnyx_response", {
      ...baseDebug,
      media_url_exists: Boolean(resolved.mediaUrl),
      storage_path_exists: Boolean(resolved.storagePath),
      telnyx_response_status: telnyx.responseStatus,
    });
    await supabaseAdmin
      .from("fax_messages")
      .update({
        telnyx_fax_id: telnyx.telnyxFaxId,
        status: telnyx.status || "queued",
        media_url: resolved.mediaUrl,
        storage_path: resolved.storagePath,
        sent_at: new Date().toISOString(),
        page_count: input.page_count ?? undefined,
      })
      .eq("id", faxRow.id);
    await supabaseAdmin.from("fax_events").insert({
      fax_message_id: faxRow.id,
      event_type: "outbound_send_requested",
      payload: {
        telnyx_fax_id: telnyx.telnyxFaxId,
        created_by_user_id: staff.user_id,
        cover_sheet_template_id: input.cover_sheet_template_id,
        packet_metadata: input.packet_metadata,
      },
    });
    return NextResponse.json({ ok: true, fax_id: faxRow.id, telnyx_fax_id: telnyx.telnyxFaxId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fax send failed.";
    const telnyxStatus = err instanceof TelnyxFaxError ? err.responseStatus : null;
    const telnyxCode = err instanceof TelnyxFaxError ? err.code : null;
    logOutboundFaxDebug("send_failed", {
      ...baseDebug,
      telnyx_response_status: telnyxStatus,
      telnyx_error_code: telnyxCode,
      telnyx_error_message: err instanceof TelnyxFaxError ? err.telnyxMessage : message,
    });
    await supabaseAdmin
      .from("fax_messages")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: message.slice(0, 500),
      })
      .eq("id", faxRow.id);
    await supabaseAdmin.from("fax_events").insert({
      fax_message_id: faxRow.id,
      event_type: "outbound_send_failed",
      payload: {
        reason: message.slice(0, 500),
        telnyx_response_status: telnyxStatus,
        telnyx_error_code: telnyxCode,
        created_by_user_id: staff.user_id,
      },
    });
    return NextResponse.json(
      {
        error: message,
        telnyx_response_status: telnyxStatus,
        telnyx_error_code: telnyxCode,
      },
      { status: 502 }
    );
  }
}
