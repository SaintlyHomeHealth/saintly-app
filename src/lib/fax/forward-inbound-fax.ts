import { randomUUID } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

export const FORWARD_SUBJECT_DEFAULT = "Forwarded fax from Saintly Home Health";

const DOC_NOT_FOUND = "This fax document could not be found. Please upload or resend it.";

export function inboundFaxHasDocumentForForward(row: FaxMessageRow): boolean {
  if (row.direction !== "inbound") return false;
  if (typeof row.storage_path === "string" && row.storage_path.trim()) return true;
  const m = typeof row.media_url === "string" ? row.media_url.trim() : "";
  return Boolean(m && m.startsWith("https://"));
}

function isMissingForwardedColumnMessage(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("forwarded_from") && (m.includes("column") || m.includes("schema cache"));
}

async function loadInboundPdfBytes(original: FaxMessageRow): Promise<Uint8Array | { error: string }> {
  const srcPath = typeof original.storage_path === "string" && original.storage_path.trim() ? original.storage_path.trim() : null;
  if (srcPath) {
    const { data, error } = await supabaseAdmin.storage.from(FAX_DOCUMENTS_BUCKET).download(srcPath);
    if (error || !data) {
      console.warn("[fax/forward] storage_download_failed", { srcPath, message: error?.message });
      return { error: DOC_NOT_FOUND };
    }
    const buf = await data.arrayBuffer();
    if (buf.byteLength === 0) return { error: DOC_NOT_FOUND };
    return new Uint8Array(buf);
  }

  const media = typeof original.media_url === "string" && original.media_url.trim() ? original.media_url.trim() : null;
  if (media && media.startsWith("https://")) {
    try {
      const res = await fetch(media, { cache: "no-store" });
      if (!res.ok) return { error: DOC_NOT_FOUND };
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) return { error: DOC_NOT_FOUND };
      return new Uint8Array(buf);
    } catch (e) {
      console.warn("[fax/forward] media_fetch_failed", { message: e instanceof Error ? e.message : String(e) });
      return { error: DOC_NOT_FOUND };
    }
  }

  return { error: DOC_NOT_FOUND };
}

function wrapTextLine(line: string, maxLen: number): string[] {
  const words = line.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxLen) {
      cur = next;
      continue;
    }
    if (cur) rows.push(cur);
    if (w.length <= maxLen) {
      cur = w;
    } else {
      for (let i = 0; i < w.length; i += maxLen) {
        rows.push(w.slice(i, i + maxLen));
      }
      cur = "";
    }
  }
  if (cur) rows.push(cur);
  return rows.length ? rows : [""];
}

async function buildCoverPdfLines(input: {
  subject: string;
  recipientLine: string;
  toDisplay: string;
  organization: string | null;
  originalFromDisplay: string;
  originalReceivedDisplay: string;
  pageCountLabel: string;
  coverNote: string | null;
}): Promise<Uint8Array> {
  const lines: string[] = ["FAX COVER SHEET", ""];
  lines.push(`Subject: ${input.subject}`);
  lines.push(`To: ${input.recipientLine}`);
  lines.push(`Fax: ${input.toDisplay}`);
  if (input.organization?.trim()) lines.push(`Organization: ${input.organization.trim()}`);
  lines.push("", "— Original inbound fax —");
  lines.push(`Sender line: ${input.originalFromDisplay}`);
  lines.push(`Received: ${input.originalReceivedDisplay}`);
  lines.push(`Pages: ${input.pageCountLabel}`);
  if (input.coverNote?.trim()) {
    lines.push("", "Message:");
    for (const row of input.coverNote.trim().split(/\r?\n/)) {
      lines.push(...wrapTextLine(row, 78));
    }
  }
  lines.push("", "Saintly Home Health");

  const flat: string[] = [];
  for (const L of lines) flat.push(...wrapTextLine(L, 90));

  const coverDoc = await PDFDocument.create();
  const page = coverDoc.addPage([612, 792]);
  const font = await coverDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await coverDoc.embedFont(StandardFonts.HelveticaBold);
  let y = 740;
  for (const text of flat) {
    const isMainHeader = text === "FAX COVER SHEET";
    const size = isMainHeader ? 14 : 11;
    const f = isMainHeader ? fontBold : font;
    page.drawText(text, { x: 54, y, size, font: f, color: rgb(0, 0, 0) });
    y -= isMainHeader ? 22 : 14;
    if (y < 60) break;
  }
  return coverDoc.save();
}

async function mergeCoverAhead(originalPdf: Uint8Array, coverPdfBytes: Uint8Array): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  const cover = await PDFDocument.load(coverPdfBytes);
  const orig = await PDFDocument.load(originalPdf);
  const coverPages = await merged.copyPages(cover, cover.getPageIndices());
  coverPages.forEach((p) => merged.addPage(p));
  const bodyPages = await merged.copyPages(orig, orig.getPageIndices());
  bodyPages.forEach((p) => merged.addPage(p));
  return merged.save();
}

function buildRecipientName(name: string | null | undefined, org: string | null | undefined): string | null {
  const n = name?.trim() || "";
  const o = org?.trim() || "";
  if (n && o) return `${n} · ${o}`;
  if (n) return n;
  if (o) return o;
  return null;
}

function buildOutboundNote(input: {
  inboundId: string;
  toE164: string;
  inboundFrom: string | null;
  inboundReceived: string | null;
}): string {
  const parts = [
    `Forwarded from inbound fax ${input.inboundId}.`,
    `Destination fax: ${input.toE164}.`,
  ];
  if (input.inboundFrom) parts.push(`Original inbound sender: ${input.inboundFrom}.`);
  if (input.inboundReceived) parts.push(`Originally received: ${input.inboundReceived}.`);
  return parts.join(" ");
}

export async function forwardInboundFaxAsOutbound(input: {
  inboundFaxMessageId: string;
  toNumberRaw: string;
  recipientName: string | null;
  recipientOrganization: string | null;
  subject: string | null;
  coverNote: string | null;
  includeCoverSheet: boolean;
  actorUserId: string;
  /** Preformatted for cover + note (display strings). */
  originalFromDisplay: string;
  originalReceivedDisplay: string;
}): Promise<
  { ok: true; newFaxId: string } | { ok: false; error: string; newFaxId?: string }
> {
  const validated = validateUsFaxNumberToE164(input.toNumberRaw);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const toNumber = validated.e164;
  const fromNumber = SAINTLY_EXISTING_FAX_NUMBER;

  const { data: original, error: loadError } = await supabaseAdmin
    .from("fax_messages")
    .select("*")
    .eq("id", input.inboundFaxMessageId)
    .maybeSingle();

  if (loadError || !original?.id) {
    return { ok: false, error: "Fax not found." };
  }

  const row = original as FaxMessageRow;
  if (row.direction !== "inbound") {
    return { ok: false, error: "Only inbound faxes can be forwarded this way." };
  }

  if (!inboundFaxHasDocumentForForward(row)) {
    return { ok: false, error: DOC_NOT_FOUND };
  }

  const rawBytes = await loadInboundPdfBytes(row);
  if ("error" in rawBytes) {
    return { ok: false, error: rawBytes.error };
  }

  let pdfBytes = rawBytes;
  let outboundPageCount: number | null = row.page_count;

  if (input.includeCoverSheet) {
    try {
      const recipientLine =
        buildRecipientName(input.recipientName, input.recipientOrganization)?.trim() || "(Recipient)";
      const coverPdf = await buildCoverPdfLines({
        subject: (input.subject?.trim() || FORWARD_SUBJECT_DEFAULT).slice(0, 500),
        recipientLine,
        toDisplay: formatPhoneForDisplay(toNumber),
        organization: input.recipientOrganization?.trim() || null,
        originalFromDisplay: input.originalFromDisplay,
        originalReceivedDisplay: input.originalReceivedDisplay,
        pageCountLabel: row.page_count != null ? String(row.page_count) : "—",
        coverNote: input.coverNote?.trim() || null,
      });
      pdfBytes = await mergeCoverAhead(rawBytes, coverPdf);
      const mergedDoc = await PDFDocument.load(pdfBytes);
      outboundPageCount = mergedDoc.getPageCount();
    } catch (e) {
      console.warn("[fax/forward] cover_merge_failed", { message: e instanceof Error ? e.message : String(e) });
      return { ok: false, error: "Could not prepare the fax document for sending." };
    }
  }

  const newId = randomUUID();
  const dateStr = new Date().toISOString().slice(0, 10);
  const destPath = `outbound/${dateStr}/${newId}.pdf`;

  const { error: upErr } = await supabaseAdmin.storage.from(FAX_DOCUMENTS_BUCKET).upload(destPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    console.warn("[fax/forward] storage_upload_failed", { destPath, message: upErr.message });
    return { ok: false, error: DOC_NOT_FOUND };
  }

  const mediaUrl = await signedFaxPdfUrl(destPath);
  if (!mediaUrl) {
    return { ok: false, error: DOC_NOT_FOUND };
  }

  try {
    await assertMediaUrlAccessible(mediaUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : DOC_NOT_FOUND;
    return { ok: false, error: msg };
  }

  let connectionId: string;
  try {
    connectionId = telnyxFaxConnectionId();
  } catch (err) {
    const message = err instanceof Error ? err.message : "TELNYX_FAX_CONNECTION_ID is not configured.";
    return { ok: false, error: message };
  }

  const subjectFinal = (input.subject?.trim() || FORWARD_SUBJECT_DEFAULT).slice(0, 500);
  const recipientNameFinal = buildRecipientName(input.recipientName, input.recipientOrganization);

  const outboundNote = buildOutboundNote({
    inboundId: row.id,
    toE164: toNumber,
    inboundFrom: row.from_number,
    inboundReceived: row.received_at,
  });

  const insertPayload: Record<string, unknown> = {
    id: newId,
    direction: "outbound",
    status: "queued",
    from_number: fromNumber,
    to_number: toNumber,
    subject: subjectFinal,
    recipient_name: recipientNameFinal,
    note: outboundNote,
    page_count: outboundPageCount,
    forwarded_from_fax_message_id: row.id,
    category: row.category ?? "misc",
    tags: row.tags ?? [],
    priority: row.priority ?? "normal",
    assigned_to_user_id: input.actorUserId,
  };

  let insertResult = await supabaseAdmin.from("fax_messages").insert(insertPayload).select("id").single();
  if (insertResult.error && isMissingForwardedColumnMessage(insertResult.error.message)) {
    delete insertPayload.forwarded_from_fax_message_id;
    insertResult = await supabaseAdmin.from("fax_messages").insert(insertPayload).select("id").single();
  }
  if (insertResult.error || !insertResult.data?.id) {
    return { ok: false, error: insertResult.error?.message ?? "Could not create outbound fax record." };
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
        storage_path: destPath,
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
      eventType: "forwarded_from_inbound",
      payload: {
        forwarded_from_fax_message_id: row.id,
        created_by_user_id: input.actorUserId,
        to_number: toNumber,
        include_cover_sheet: input.includeCoverSheet,
      },
    });

    await recordFaxEvent({
      faxMessageId: row.id,
      eventType: "inbound_forwarded_outbound",
      payload: {
        new_outbound_fax_message_id: newId,
        to_number: toNumber,
        created_by_user_id: input.actorUserId,
        include_cover_sheet: input.includeCoverSheet,
      },
    });

    console.log("[fax/forward] sent", {
      inbound_fax_id: row.id,
      outbound_fax_id: newId,
      actor_user_id: input.actorUserId,
      to_number: toNumber,
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
        storage_path: destPath,
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
        forwarded_from_fax_message_id: row.id,
      },
    });

    return { ok: false, error: message, newFaxId: newId };
  }
}
