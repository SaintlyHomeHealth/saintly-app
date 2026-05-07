import { randomUUID } from "crypto";
import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import {
  FAX_DOCUMENTS_BUCKET,
  SAINTLY_EXISTING_FAX_NUMBER,
  recordFaxEvent,
  signedFaxPdfUrl,
  type FaxMessageRow,
} from "@/lib/fax/fax-service";
import {
  assertMediaUrlAccessible,
  callTelnyxSendFax,
  TelnyxFaxError,
  telnyxFaxConnectionId,
} from "@/lib/fax/outbound-fax-telnyx";
import { validateUsFaxNumberToE164 } from "@/lib/fax/us-fax-validation";

const DOC_UNAVAILABLE = "Original fax document is unavailable. Please upload and send a new fax.";

function isMissingResentColumnMessage(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("resent_from") && (m.includes("column") || m.includes("schema cache"));
}

async function copyOriginalDocumentToNewOutboundPath(input: {
  original: FaxMessageRow;
  newFaxMessageId: string;
}): Promise<{ storagePath: string } | { error: string }> {
  const { original, newFaxMessageId } = input;
  const dateStr = new Date().toISOString().slice(0, 10);
  const destPath = `outbound/${dateStr}/${newFaxMessageId}.pdf`;

  const srcPath = typeof original.storage_path === "string" && original.storage_path.trim() ? original.storage_path.trim() : null;
  if (srcPath) {
    const { data, error } = await supabaseAdmin.storage.from(FAX_DOCUMENTS_BUCKET).download(srcPath);
    if (error || !data) {
      console.warn("[fax/resend] storage_download_failed", { srcPath, message: error?.message });
      return { error: DOC_UNAVAILABLE };
    }
    const buf = await data.arrayBuffer();
    if (buf.byteLength === 0) {
      return { error: DOC_UNAVAILABLE };
    }
    const { error: upErr } = await supabaseAdmin.storage.from(FAX_DOCUMENTS_BUCKET).upload(destPath, buf, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) {
      console.warn("[fax/resend] storage_upload_failed", { destPath, message: upErr.message });
      return { error: DOC_UNAVAILABLE };
    }
    return { storagePath: destPath };
  }

  const media = typeof original.media_url === "string" && original.media_url.trim() ? original.media_url.trim() : null;
  if (media && media.startsWith("https://")) {
    try {
      const res = await fetch(media, { cache: "no-store" });
      if (!res.ok) {
        return { error: DOC_UNAVAILABLE };
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) {
        return { error: DOC_UNAVAILABLE };
      }
      const { error: upErr } = await supabaseAdmin.storage.from(FAX_DOCUMENTS_BUCKET).upload(destPath, buf, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (upErr) {
        return { error: DOC_UNAVAILABLE };
      }
      return { storagePath: destPath };
    } catch (e) {
      console.warn("[fax/resend] media_fetch_failed", { message: e instanceof Error ? e.message : String(e) });
      return { error: DOC_UNAVAILABLE };
    }
  }

  return { error: DOC_UNAVAILABLE };
}

export async function resendOutboundFax(input: {
  originalFaxMessageId: string;
  newRecipientRaw: string;
  actorUserId: string;
}): Promise<{ ok: true; newFaxId: string } | { ok: false; error: string; newFaxId?: string }> {
  const validated = validateUsFaxNumberToE164(input.newRecipientRaw);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const toNumber = validated.e164;
  const fromNumber = SAINTLY_EXISTING_FAX_NUMBER;

  const { data: original, error: loadError } = await supabaseAdmin
    .from("fax_messages")
    .select("*")
    .eq("id", input.originalFaxMessageId)
    .maybeSingle();

  if (loadError || !original?.id) {
    return { ok: false, error: "Fax not found." };
  }

  const row = original as FaxMessageRow;
  if (row.direction !== "outbound") {
    return { ok: false, error: "Only outbound faxes can be resent." };
  }

  const newId = randomUUID();
  const copied = await copyOriginalDocumentToNewOutboundPath({ original: row, newFaxMessageId: newId });
  if ("error" in copied) {
    return { ok: false, error: copied.error };
  }

  const mediaUrl = await signedFaxPdfUrl(copied.storagePath);
  if (!mediaUrl) {
    return { ok: false, error: DOC_UNAVAILABLE };
  }

  try {
    await assertMediaUrlAccessible(mediaUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : DOC_UNAVAILABLE;
    return { ok: false, error: msg };
  }

  let connectionId: string;
  try {
    connectionId = telnyxFaxConnectionId();
  } catch (err) {
    const message = err instanceof Error ? err.message : "TELNYX_FAX_CONNECTION_ID is not configured.";
    return { ok: false, error: message };
  }

  const insertPayload: Record<string, unknown> = {
    id: newId,
    direction: "outbound",
    status: "queued",
    from_number: fromNumber,
    to_number: toNumber,
    subject: row.subject,
    recipient_name: row.recipient_name,
    note: row.note,
    page_count: row.page_count,
    lead_id: row.lead_id,
    patient_id: row.patient_id,
    facility_id: row.facility_id,
    referral_source_id: row.referral_source_id,
    contact_id: row.contact_id,
    category: row.category,
    tags: row.tags ?? [],
    priority: row.priority,
    assigned_to_user_id: input.actorUserId,
    resent_from_fax_message_id: row.id,
  };

  let insertResult = await supabaseAdmin.from("fax_messages").insert(insertPayload).select("id").single();
  if (insertResult.error && isMissingResentColumnMessage(insertResult.error.message)) {
    delete insertPayload.resent_from_fax_message_id;
    insertResult = await supabaseAdmin.from("fax_messages").insert(insertPayload).select("id").single();
  }
  if (insertResult.error || !insertResult.data?.id) {
    return { ok: false, error: insertResult.error?.message ?? "Could not create resend fax record." };
  }

  try {
    const telnyx = await callTelnyxSendFax({
      to: toNumber,
      from: fromNumber,
      mediaUrl,
      connectionId,
    });

    await supabaseAdmin
      .from("fax_messages")
      .update({
        telnyx_fax_id: telnyx.telnyxFaxId,
        status: telnyx.status || "queued",
        media_url: mediaUrl,
        storage_path: copied.storagePath,
        sent_at: new Date().toISOString(),
      })
      .eq("id", newId);

    await recordFaxEvent({
      faxMessageId: newId,
      eventType: "outbound_send_requested",
      payload: { telnyx_fax_id: telnyx.telnyxFaxId, created_by_user_id: input.actorUserId },
    });

    await recordFaxEvent({
      faxMessageId: newId,
      eventType: "fax_resent",
      payload: {
        resent_from_fax_message_id: row.id,
        telnyx_fax_id: telnyx.telnyxFaxId,
        created_by_user_id: input.actorUserId,
        to_number: toNumber,
      },
    });

    return { ok: true, newFaxId: newId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fax send failed.";
    const telnyxStatus = err instanceof TelnyxFaxError ? err.responseStatus : null;
    const telnyxCode = err instanceof TelnyxFaxError ? err.code : null;

    await supabaseAdmin
      .from("fax_messages")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: message.slice(0, 500),
        media_url: mediaUrl,
        storage_path: copied.storagePath,
      })
      .eq("id", newId);

    await recordFaxEvent({
      faxMessageId: newId,
      eventType: "outbound_send_failed",
      payload: {
        reason: message.slice(0, 500),
        telnyx_response_status: telnyxStatus,
        telnyx_error_code: telnyxCode,
        created_by_user_id: input.actorUserId,
        resent_from_fax_message_id: row.id,
      },
    });

    return { ok: false, error: message, newFaxId: newId };
  }
}
