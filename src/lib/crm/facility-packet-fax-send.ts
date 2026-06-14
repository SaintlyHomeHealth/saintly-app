import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { buildFaxPacketPdf, formatPacketDate } from "@/lib/fax/fax-packet-pdf";
import {
  assertMediaUrlAccessible,
  callTelnyxSendFax,
  resolveOutboundSendMedia,
  telnyxFaxConnectionId,
} from "@/lib/fax/outbound-fax-telnyx";
import { SAINTLY_EXISTING_FAX_NUMBER } from "@/lib/fax/fax-service";
import { normalizeFaxNumberToE164 } from "@/lib/fax/phone-numbers";
import { isFacilityPacketFaxConfigured } from "@/lib/crm/facility-packet-email-from";
import type { PacketMaterialRow } from "@/lib/crm/facility-packet-types";
import { downloadPacketMaterialBytes } from "@/lib/crm/facility-packet-materials";

export async function sendFacilityPacketFax(input: {
  toFax: string;
  recipientName?: string | null;
  recipientOrganization?: string | null;
  subject?: string | null;
  coverSheetText: string;
  facilityId: string;
  staffUserId: string;
  materials: PacketMaterialRow[];
}): Promise<
  | { ok: true; providerMessageId: string | null; faxMessageId: string; storagePath: string | null }
  | { ok: false; code: "FAX_NOT_CONFIGURED" | "SEND_FAILED"; message: string }
> {
  if (!isFacilityPacketFaxConfigured()) {
    return {
      ok: false,
      code: "FAX_NOT_CONFIGURED",
      message: "Fax sending is not configured. Use Mark Sent instead.",
    };
  }

  const toNumber = normalizeFaxNumberToE164(input.toFax);
  if (!toNumber) {
    return { ok: false, code: "SEND_FAILED", message: "Invalid fax number." };
  }

  const attachmentFiles: File[] = [];
  for (const material of input.materials) {
    if (!material.storage_path) continue;
    const downloaded = await downloadPacketMaterialBytes(material.storage_path);
    if (!downloaded) {
      return {
        ok: false,
        code: "SEND_FAILED",
        message: `Material file missing: ${material.name}`,
      };
    }
    const name = material.file_name ?? downloaded.fileName;
    attachmentFiles.push(new File([downloaded.bytes], name, { type: downloaded.mimeType }));
  }

  if (!attachmentFiles.length) {
    return {
      ok: false,
      code: "SEND_FAILED",
      message: "Select at least one material with an uploaded file for fax delivery.",
    };
  }

  const coverMessage = input.coverSheetText.trim();
  const { pdfBytes, pageCount } = await buildFaxPacketPdf({
    coverFields: {
      recipientName: input.recipientName?.trim() || "Recipient",
      recipientOrganization: input.recipientOrganization?.trim() || "",
      recipientPhone: "",
      recipientFax: input.toFax,
      patientName: "",
      patientDob: "",
      subject: input.subject?.trim() || "Saintly Home Health Referral Packet",
      message: coverMessage,
      date: formatPacketDate(),
      totalPages: String(pageCountEstimate(pageCount, attachmentFiles.length)),
    },
    attachmentFiles,
  });

  const fromNumber = SAINTLY_EXISTING_FAX_NUMBER;
  const { data: faxRow, error: insertError } = await supabaseAdmin
    .from("fax_messages")
    .insert({
      direction: "outbound",
      status: "queued",
      from_number: fromNumber,
      to_number: toNumber,
      subject: input.subject?.trim() || "Saintly Home Health Referral Packet",
      recipient_name: input.recipientName?.trim() || null,
      facility_id: input.facilityId,
      category: "facility_packet",
      tags: ["facility_packet"],
      page_count: pageCount,
      assigned_to_user_id: input.staffUserId,
      note: coverMessage.slice(0, 500),
    })
    .select("id")
    .single();

  if (insertError || !faxRow?.id) {
    return { ok: false, code: "SEND_FAILED", message: "Could not create fax record." };
  }

  const faxMessageId = String(faxRow.id);
  const pdfFile = new File([pdfBytes], `facility-packet-${faxMessageId}.pdf`, { type: "application/pdf" });

  try {
    const connectionId = telnyxFaxConnectionId();
    const resolved = await resolveOutboundSendMedia({ file: pdfFile, storage_path: null, media_url: null }, faxMessageId);
    await assertMediaUrlAccessible(resolved.mediaUrl);
    const telnyx = await callTelnyxSendFax({
      to: toNumber,
      from: fromNumber,
      mediaUrl: resolved.mediaUrl,
      connectionId,
    });

    await supabaseAdmin
      .from("fax_messages")
      .update({
        telnyx_fax_id: telnyx.telnyxFaxId,
        status: "queued",
        storage_path: resolved.storagePath,
      })
      .eq("id", faxMessageId);

    return {
      ok: true,
      providerMessageId: telnyx.telnyxFaxId,
      faxMessageId,
      storagePath: resolved.storagePath,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fax send failed.";
    await supabaseAdmin.from("fax_messages").update({ status: "failed", note: message.slice(0, 500) }).eq("id", faxMessageId);
    return { ok: false, code: "SEND_FAILED", message };
  }
}

function pageCountEstimate(coverPages: number, attachmentCount: number): number {
  return Math.max(coverPages, 1 + attachmentCount);
}
