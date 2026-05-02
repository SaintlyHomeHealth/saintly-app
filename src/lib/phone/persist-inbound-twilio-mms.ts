import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PHONE_MESSAGE_MEDIA_BUCKET, PHONE_MESSAGE_MMS_DOWNLOAD_MAX_BYTES } from "@/lib/phone/phone-message-media-bucket";
import {
  fetchTwilioMediaAuthorized,
  fetchTwilioMessageMediaUriListViaRest,
} from "@/lib/phone/twilio-media-fetch";

function sanitizeFileName(base: string): string {
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 180) || "file";
}

function extFromNormalizedMime(norm: string): string {
  if (norm === "image/jpeg" || norm === "image/jpg") return ".jpg";
  if (norm === "image/png") return ".png";
  if (norm === "image/webp") return ".webp";
  if (norm === "image/gif") return ".gif";
  if (norm === "application/pdf") return ".pdf";
  if (norm.startsWith("audio/")) return ".bin";
  if (norm.startsWith("video/")) return ".bin";
  return ".bin";
}

function pickFileName(declaredCt: string, index: number, messageSidSuffix: string): string {
  const norm = declaredCt.toLowerCase().split(";")[0]?.trim() ?? "";
  const ext = extFromNormalizedMime(norm);
  return sanitizeFileName(`mms-${messageSidSuffix}-part${index}${ext}`);
}

type MmsPart = { index: number; rawUrl: string; declaredContentType: string };

function buildWebhookMmsParts(messageSid: string, params: Record<string, string>): MmsPart[] {
  const n = Number.parseInt((params.NumMedia ?? "0").trim(), 10);
  const count = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 10) : 0;
  const out: MmsPart[] = [];
  if (count === 0) return out;

  for (let i = 0; i < count; i++) {
    const rawUrl =
      typeof params[`MediaUrl${i}`] === "string" ? params[`MediaUrl${i}`]!.trim() : "";
    if (!rawUrl) {
      console.warn("[sms-inbound] mms_missing_media_url", { messageSid, index: i });
      continue;
    }
    const declaredCt =
      typeof params[`MediaContentType${i}`] === "string"
        ? params[`MediaContentType${i}`]!.trim()
        : "";
    out.push({ index: i, rawUrl, declaredContentType: declaredCt });
  }
  return out;
}

async function resolveMmsParts(messageSid: string, params: Record<string, string>): Promise<MmsPart[]> {
  const webhookParts = buildWebhookMmsParts(messageSid, params);
  if (webhookParts.length > 0) {
    return webhookParts;
  }

  /** Twilio MMS uses MessageSid `MM…`; some paths omit NumMedia/MediaUrlN on the webhook even when media exists. */
  if (!/^MM/i.test(messageSid.trim())) {
    return [];
  }

  const listed = await fetchTwilioMessageMediaUriListViaRest(messageSid);
  if (!listed.ok) {
    console.warn("[sms-inbound] mms_rest_media_list_failed", {
      messageSid,
      error: listed.error,
    });
    return [];
  }
  if (listed.mediaUrlsAbsolute.length === 0) {
    console.warn("[sms-inbound] mms_rest_media_empty", { messageSid });
    return [];
  }

  console.log("[sms-inbound] mms_rest_media_candidates", {
    messageSid,
    count: listed.mediaUrlsAbsolute.length,
  });

  return listed.mediaUrlsAbsolute.slice(0, 10).map((rawUrl, index) => ({
    index,
    rawUrl,
    declaredContentType: "",
  }));
}

async function ingestOneMmsAttachment(
  supabase: SupabaseClient,
  input: { conversationId: string; messageId: string; messageSid: string },
  part: MmsPart,
  sidShort: string
): Promise<void> {
  const { messageSid } = input;
  const i = part.index;
  let declaredCt = part.declaredContentType;

  let bytes: Uint8Array;
  try {
    const dl = await fetchTwilioMediaAuthorized(part.rawUrl);
    if (!dl.ok) {
      console.warn("[sms-inbound] mms_download_failed", {
        messageSid,
        index: i,
        error: dl.error,
        status: dl.status,
      });
      return;
    }
    bytes = dl.bytes;
    const headerCt = dl.contentType?.toLowerCase().split(";")[0]?.trim() ?? "";
    if (!declaredCt && headerCt && !headerCt.includes("octet-stream")) {
      declaredCt = headerCt;
    }
    if (bytes.byteLength > PHONE_MESSAGE_MMS_DOWNLOAD_MAX_BYTES) {
      console.warn("[sms-inbound] mms_too_large", {
        messageSid,
        index: i,
        size: bytes.byteLength,
        max: PHONE_MESSAGE_MMS_DOWNLOAD_MAX_BYTES,
      });
      return;
    }
  } catch (e) {
    console.warn("[sms-inbound] mms_download_exception", {
      messageSid,
      index: i,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  const normCt =
    (declaredCt || "application/octet-stream").split(";")[0]?.trim()?.toLowerCase() ??
    "application/octet-stream";

  const fileName = pickFileName(normCt, i, sidShort);
  const storage_path = sanitizeFileName(
    `${input.conversationId}/${input.messageId}/${i}-${randomUUID()}-${fileName}`
  );
  const bodyBuf = Buffer.isBuffer(bytes)
    ? Buffer.from(bytes)
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const { error: upErr } = await supabase.storage
    .from(PHONE_MESSAGE_MEDIA_BUCKET)
    .upload(storage_path, bodyBuf, { contentType: normCt || "application/octet-stream", upsert: false });

  if (upErr) {
    console.warn("[sms-inbound] mms_storage_upload_failed", {
      messageSid,
      index: i,
      error: upErr.message,
    });
    return;
  }

  const insertRow = {
    message_id: input.messageId,
    conversation_id: input.conversationId,
    direction: "inbound" as const,
    provider: "twilio",
    provider_message_sid: messageSid,
    provider_media_index: i,
    provider_media_url: part.rawUrl.slice(0, 4000),
    content_type: normCt,
    file_name: fileName,
    storage_bucket: PHONE_MESSAGE_MEDIA_BUCKET,
    storage_path,
    size_bytes: bodyBuf.byteLength,
  };

  const { error: insErr } = await supabase.from("phone_message_attachments").insert(insertRow);
  const code = insErr?.code != null ? String(insErr.code) : "";
  if (insErr && code !== "23505") {
    console.warn("[sms-inbound] mms_attachment_row_failed", {
      messageSid,
      index: i,
      error: insErr.message,
    });
    await supabase.storage.from(PHONE_MESSAGE_MEDIA_BUCKET).remove([storage_path]).catch(() => {});
  }
}

/**
 * Persist each Twilio MMS part into private Storage + phone_message_attachments.
 * Fail-open per-part; unique (provider_message_sid, provider_media_index) makes retries idempotent.
 * Uses webhook NumMedia/MediaUrl* when present; otherwise lists media via REST for `MM…` MessageSids.
 */
export async function persistInboundTwilioMmsAttachments(
  supabase: SupabaseClient,
  input: {
    messageId: string;
    conversationId: string;
    messageSid: string;
    params: Record<string, string>;
  }
): Promise<void> {
  const messageSid = input.messageSid.trim();
  if (!messageSid) return;

  const sidShort = messageSid.replace(/[^\w\-]+/g, "").slice(-12) || "msg";

  const parts = await resolveMmsParts(messageSid, input.params);
  if (parts.length === 0) {
    return;
  }

  for (const part of parts) {
    await ingestOneMmsAttachment(
      supabase,
      {
        messageId: input.messageId,
        conversationId: input.conversationId,
        messageSid,
      },
      part,
      sidShort
    );
  }
}
