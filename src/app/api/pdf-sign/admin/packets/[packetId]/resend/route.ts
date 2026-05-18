import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { sendPdfSignLinkEmail } from "@/lib/email/send-pdf-sign-email";
import { buildPdfSignRecipientUrl } from "@/lib/pdf-sign/app-url";
import { deliverPdfSignLinkSms } from "@/lib/pdf-sign/deliver-sign-link-sms";
import { pdfSignResendDeliveryStatusMessage } from "@/lib/pdf-sign/delivery-status-message";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import {
  pdfSignDefaultFromEmail,
  sanitizePdfSignSelectedFromEmail,
} from "@/lib/pdf-sign/pdf-sign-from-email";
import { createRawSignToken, hashSignToken } from "@/lib/pdf-sign/token";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

type Body = {
  /** @deprecated Prefer omitting channel to resend email and SMS together. */
  channel?: "email" | "sms";
  /**
   * When true, only mint a fresh signing link and return it — do not send email
   * or SMS. Use for "Copy signing link" so admins don't trigger accidental resends.
   */
  copyOnly?: boolean;
  /** Optional custom phone number for the SMS resend (defaults to packet / recipient phone). */
  phone?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ packetId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { packetId } = await context.params;
  if (!packetId) return NextResponse.json({ error: "Missing packet id" }, { status: 400 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    /* allow empty body */
  }
  const channel = body.channel;
  const copyOnly = body.copyOnly === true;

  const { data: packet, error } = await supabaseAdmin
    .from("signature_packets")
    .select(
      "id, status, title, recipient_email, recipient_name, recipient_phone, voided_at, canceled_at, deleted_at, expires_at, completed_at, metadata"
    )
    .eq("id", packetId)
    .maybeSingle();
  if (error || !packet) return NextResponse.json({ error: "Packet not found." }, { status: 404 });
  if (packet.deleted_at) {
    return NextResponse.json({ error: "This packet has been removed from the list." }, { status: 409 });
  }
  if (packet.voided_at) {
    return NextResponse.json({ error: "Packet has been voided." }, { status: 409 });
  }
  if (packet.status === "canceled" || packet.canceled_at) {
    return NextResponse.json({ error: "Packet has been canceled." }, { status: 409 });
  }
  if (packet.completed_at || packet.status === "completed" || packet.status === "signed") {
    return NextResponse.json({ error: "Packet already completed." }, { status: 409 });
  }

  const { data: recipient } = await supabaseAdmin
    .from("signature_recipients")
    .select("id, phone, token_expires_at")
    .eq("packet_id", packetId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!recipient) {
    return NextResponse.json({ error: "Packet has no recipient." }, { status: 400 });
  }

  const expiresAt = packet.expires_at || recipient.token_expires_at;
  const rawToken = createRawSignToken();
  const tokenHash = hashSignToken(rawToken);
  const { error: rotateErr } = await supabaseAdmin
    .from("signature_recipients")
    .update({ token_hash: tokenHash, token_expires_at: expiresAt })
    .eq("id", recipient.id);
  if (rotateErr) return NextResponse.json({ error: rotateErr.message }, { status: 500 });

  const link = buildPdfSignRecipientUrl(rawToken);
  const docLabel = packet.title || "Saintly document";
  const metaRecord = packet.metadata as Record<string, unknown> | null;
  const pdfSignReply =
    sanitizePdfSignSelectedFromEmail(
      typeof metaRecord?.pdf_sign_from_email === "string" ? metaRecord.pdf_sign_from_email : null
    ) ?? pdfSignDefaultFromEmail();

  if (copyOnly) {
    await logSignatureEvent({
      packetId,
      recipientId: recipient.id,
      actor: "staff",
      actorStaffUserId: user.id,
      action: "signing_link_copied",
      metadata: { note: "Link minted for copy; email/SMS not sent." },
    });
    return NextResponse.json({ ok: true, signUrl: link });
  }

  const sendEmail = channel !== "sms";
  const sendSms = channel !== "email";
  const phone = (body.phone?.trim() || packet.recipient_phone || recipient.phone || "").trim();

  let emailSent = false;
  let emailError: string | null = null;
  if (sendEmail) {
    if (!packet.recipient_email) {
      return NextResponse.json({ error: "Packet has no recipient email." }, { status: 400 });
    }
    const r = await sendPdfSignLinkEmail({
      to: packet.recipient_email,
      recipientName: packet.recipient_name,
      link,
      documentLabel: docLabel,
      pdfSignReplyToEmail: pdfSignReply,
    });
    emailSent = r.ok;
    emailError = r.ok ? null : r.error;
    await logSignatureEvent({
      packetId,
      recipientId: recipient.id,
      actor: "staff",
      actorStaffUserId: user.id,
      action: r.ok ? "email_resent" : "email_resend_failed",
      metadata: { error: emailError },
    });
  }

  let smsSent = false;
  let smsError: string | null = null;
  if (sendSms && phone) {
    const sms = await deliverPdfSignLinkSms({
      packetId,
      recipientId: recipient.id,
      phone,
      signUrl: link,
    });
    smsSent = sms.smsSent;
    smsError = sms.smsError;
  }

  const deliveryStatusMessage = pdfSignResendDeliveryStatusMessage({
    emailSent,
    hasPhone: Boolean(phone),
    smsSent,
    smsFailed: Boolean(phone && smsError),
  });

  return NextResponse.json({
    ok: true,
    signUrl: link,
    emailSent: sendEmail ? emailSent : undefined,
    emailError: sendEmail ? emailError : undefined,
    smsSent: sendSms && phone ? smsSent : undefined,
    smsError: sendSms && phone ? smsError : undefined,
    deliveryStatusMessage,
  });
}
