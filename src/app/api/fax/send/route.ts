import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  FAX_DOCUMENTS_BUCKET,
  SAINTLY_EXISTING_FAX_NUMBER,
  signedFaxPdfUrl,
  type FaxCategory,
} from "@/lib/fax/fax-service";
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
  category: FaxCategory;
  tags: string[];
};

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseCategory(value: unknown): FaxCategory {
  const raw = textOrNull(value);
  return raw && VALID_CATEGORIES.has(raw as FaxCategory) ? (raw as FaxCategory) : "misc";
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
      category: parseCategory(formData.get("category")),
      tags: parseTags(formData.get("tags")),
    };
  }

  const json = (await req.json()) as Record<string, unknown>;
  return {
    to_number: textOrNull(json.to_number),
    from_number: textOrNull(json.from_number),
    media_url: textOrNull(json.media_url ?? json.pdf_url),
    storage_path: textOrNull(json.storage_path),
    file: null,
    subject: textOrNull(json.subject),
    recipient_name: textOrNull(json.recipient_name),
    lead_id: textOrNull(json.lead_id),
    patient_id: textOrNull(json.patient_id),
    facility_id: textOrNull(json.facility_id),
    referral_source_id: textOrNull(json.referral_source_id),
    category: parseCategory(json.category),
    tags: parseTags(json.tags),
  };
}

async function resolveMediaUrl(input: SendFaxInput, faxMessageId: string): Promise<{ mediaUrl: string; storagePath: string | null }> {
  if (input.media_url) {
    return { mediaUrl: input.media_url, storagePath: input.storage_path };
  }
  if (input.file) {
    const storagePath = `outbound/${new Date().toISOString().slice(0, 10)}/${faxMessageId}.pdf`;
    const { error } = await supabaseAdmin.storage.from(FAX_DOCUMENTS_BUCKET).upload(storagePath, await input.file.arrayBuffer(), {
      contentType: input.file.type || "application/pdf",
      upsert: true,
    });
    if (error) throw new Error("Could not store fax PDF before sending.");
    const mediaUrl = await signedFaxPdfUrl(storagePath);
    if (!mediaUrl) throw new Error("Could not create a secure PDF link for Telnyx.");
    return { mediaUrl, storagePath };
  }
  if (input.storage_path) {
    const mediaUrl = await signedFaxPdfUrl(input.storage_path);
    if (!mediaUrl) throw new Error("Could not create a secure PDF link for Telnyx.");
    return { mediaUrl, storagePath: input.storage_path };
  }
  throw new Error("Attach a PDF or provide an existing PDF URL.");
}

function telnyxApiKey(): string {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new Error("Telnyx API key is not configured.");
  return key;
}

async function callTelnyxSendFax(input: { to: string; from: string; mediaUrl: string }) {
  const res = await fetch("https://api.telnyx.com/v2/faxes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${telnyxApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.to,
      from: input.from,
      media_url: input.mediaUrl,
      webhook_url: "https://www.appsaintlyhomehealth.com/api/fax/status",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errors = Array.isArray(body.errors) ? body.errors : [];
    const message =
      errors
        .map((err) => (err && typeof err === "object" ? (err as Record<string, unknown>).detail : null))
        .filter((detail): detail is string => typeof detail === "string" && detail.trim().length > 0)
        .join("; ") || `Telnyx rejected the fax (${res.status}).`;
    throw new Error(message);
  }
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : body;
  return {
    telnyxFaxId: typeof data.id === "string" ? data.id : null,
    status: typeof data.status === "string" ? data.status : "queued",
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
  if (!toNumber) {
    return NextResponse.json({ error: "Enter a valid destination fax number." }, { status: 400 });
  }

  const { data: faxRow, error: insertError } = await supabaseAdmin
    .from("fax_messages")
    .insert({
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
      category: input.category,
      tags: input.tags,
      assigned_to_user_id: staff.user_id,
    })
    .select("id")
    .single();
  if (insertError || !faxRow?.id) {
    return NextResponse.json({ error: "Could not create outbound fax record." }, { status: 500 });
  }

  try {
    const resolved = await resolveMediaUrl(input, faxRow.id as string);
    const telnyx = await callTelnyxSendFax({ to: toNumber, from: fromNumber, mediaUrl: resolved.mediaUrl });
    await supabaseAdmin
      .from("fax_messages")
      .update({
        telnyx_fax_id: telnyx.telnyxFaxId,
        status: telnyx.status || "queued",
        media_url: resolved.mediaUrl,
        storage_path: resolved.storagePath,
        sent_at: new Date().toISOString(),
      })
      .eq("id", faxRow.id);
    await supabaseAdmin.from("fax_events").insert({
      fax_message_id: faxRow.id,
      event_type: "outbound_send_requested",
      payload: { telnyx_fax_id: telnyx.telnyxFaxId, created_by_user_id: staff.user_id },
    });
    return NextResponse.json({ ok: true, fax_id: faxRow.id, telnyx_fax_id: telnyx.telnyxFaxId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fax send failed.";
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
      payload: { reason: message.slice(0, 500), created_by_user_id: staff.user_id },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
