import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { sendPdfSignLinkEmail } from "@/lib/email/send-pdf-sign-email";
import { buildPdfSignRecipientUrl } from "@/lib/pdf-sign/app-url";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import {
  pdfSignDefaultFromEmail,
  sanitizePdfSignSelectedFromEmail,
} from "@/lib/pdf-sign/pdf-sign-from-email";
import { createRawSignToken, hashSignToken } from "@/lib/pdf-sign/token";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

type Body = {
  channel?: "email" | "sms";
  /**
   * When true, only mint a fresh signing link and return it — do not send email
   * or SMS. Use for "Copy signing link" so admins don't trigger accidental resends.
   */
  copyOnly?: boolean;
  /** When true, mints a new signing token (and invalidates the old one). Default true for resends; ignored when copyOnly (always rotates). */
  rotateToken?: boolean;
  /** Optional custom phone number for the SMS resend (defaults to packet phone). */
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
  const channel = body.channel === "sms" ? "sms" : "email";
  const copyOnly = body.copyOnly === true;

  const { data: packet, error } = await supabaseAdmin
    .from("signature_packets")
    .select(
      "id, status, title, recipient_email, recipient_name, recipient_phone, voided_at, expires_at, completed_at, metadata"
    )
    .eq("id", packetId)
    .maybeSingle();
  if (error || !packet) return NextResponse.json({ error: "Packet not found." }, { status: 404 });
  if (packet.voided_at) {
    return NextResponse.json({ error: "Packet has been voided." }, { status: 409 });
  }
  if (packet.completed_at || packet.status === "completed" || packet.status === "signed") {
    return NextResponse.json({ error: "Packet already completed." }, { status: 409 });
  }

  const { data: recipient } = await supabaseAdmin
    .from("signature_recipients")
    .select("id, token_expires_at")
    .eq("packet_id", packetId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!recipient) {
    return NextResponse.json({ error: "Packet has no recipient." }, { status: 400 });
  }

  const expiresAt = packet.expires_at || recipient.token_expires_at;
  // Raw tokens are never stored; we always mint a new token when generating a link.
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
      actor: "staff",
      actorStaffUserId: user.id,
      action: "signing_link_copied",
      metadata: { note: "Link minted for copy; email/SMS not sent." },
    });
    return NextResponse.json({ ok: true, signUrl: link });
  }

  if (channel === "email") {
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
    await logSignatureEvent({
      packetId,
      actor: "staff",
      actorStaffUserId: user.id,
      action: r.ok ? "email_resent" : "email_resend_failed",
      metadata: { error: r.ok ? null : r.error },
    });
    if (!r.ok) {
      return NextResponse.json({
        ok: true,
        signUrl: link,
        emailSent: false,
        emailError: r.error,
      });
    }
    return NextResponse.json({ ok: true, signUrl: link, emailSent: true });
  }

  // SMS channel
  const phone = (body.phone?.trim() || packet.recipient_phone || "").trim();
  if (!phone) {
    return NextResponse.json(
      { error: "Phone number is required for SMS." },
      { status: 400 }
    );
  }
  let smsOk = false;
  let smsErr: string | null = null;
  try {
    const r = await sendSignLinkSms({
      to: phone,
      signUrl: link,
      packetName: docLabel,
      recipientName: packet.recipient_name,
    });
    if (r.kind === "sent") smsOk = true;
    else if (r.kind === "failed") smsErr = r.error;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[pdf-sign] resend SMS unexpected error:", msg);
    smsErr = msg;
  }
  await supabaseAdmin
    .from("signature_packets")
    .update({
      recipient_phone: phone,
      sms_sent_at: smsOk ? new Date().toISOString() : null,
      sms_error: smsErr,
      sms_requested: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", packetId);
  await logSignatureEvent({
    packetId,
    actor: "staff",
    actorStaffUserId: user.id,
    action: smsOk ? "sms_resent" : "sms_failed",
    metadata: { error: smsOk ? null : smsErr, phone_last4: phone.slice(-4) },
  });
  if (!smsOk) {
    return NextResponse.json({
      ok: true,
      signUrl: link,
      smsSent: false,
      smsError: smsErr,
    });
  }
  return NextResponse.json({ ok: true, signUrl: link, smsSent: true });
}
