import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import { sendSignLinkSms } from "@/lib/pdf-sign/send-sign-sms";

export type DeliverPdfSignLinkSmsResult = {
  smsSent: boolean;
  smsError: string | null;
  skipped: boolean;
};

/**
 * Sends the signing link SMS when a phone is present; updates packet SMS columns and logs events.
 */
export async function deliverPdfSignLinkSms(input: {
  packetId: string;
  recipientId: string;
  phone: string | null | undefined;
  signUrl: string;
}): Promise<DeliverPdfSignLinkSmsResult> {
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!phone) {
    return { smsSent: false, smsError: null, skipped: true };
  }

  console.log("[pdf-sign] SMS attempted", {
    packetId: input.packetId,
    recipientId: input.recipientId,
  });

  let smsSent = false;
  let smsError: string | null = null;

  try {
    const r = await sendSignLinkSms({
      to: phone,
      signUrl: input.signUrl,
      packetId: input.packetId,
      recipientId: input.recipientId,
    });
    if (r.kind === "sent") {
      smsSent = true;
      console.log("[pdf-sign] SMS sent successfully", {
        packetId: input.packetId,
        recipientId: input.recipientId,
        messageSid: r.messageSid,
      });
    } else if (r.kind === "failed") {
      smsError = r.error;
      console.warn("[pdf-sign] SMS failed", {
        packetId: input.packetId,
        recipientId: input.recipientId,
        error: r.error,
      });
    }
  } catch (e: unknown) {
    smsError = e instanceof Error ? e.message : String(e);
    console.warn("[pdf-sign] SMS failed", {
      packetId: input.packetId,
      recipientId: input.recipientId,
      error: smsError,
    });
  }

  await supabaseAdmin
    .from("signature_packets")
    .update({
      recipient_phone: phone,
      sms_sent_at: smsSent ? new Date().toISOString() : null,
      sms_error: smsError,
      sms_requested: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.packetId);

  await logSignatureEvent({
    packetId: input.packetId,
    recipientId: input.recipientId,
    actor: "system",
    action: smsSent ? "sms_sent" : smsError ? "sms_failed" : "sms_skipped",
    metadata: { smsError },
  });

  return { smsSent, smsError, skipped: false };
}
