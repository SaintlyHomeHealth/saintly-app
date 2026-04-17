import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyInboundTwilioSms } from "@/lib/phone/inbound-sms-webhook";
import { processSmsIntakeReply } from "@/lib/phone/sms-intake-reply";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Twilio Messaging inbound webhook: conversation logging + SMS reply → lead conversion.
 *
 * Configure in Twilio Console → Messaging → A MESSAGE COMES IN → POST to this URL
 * (use instead of `/api/twilio/sms/inbound` if you want reply→lead on the same handler).
 * Voice and auto-followup flows are unchanged.
 */
export async function POST(req: NextRequest) {
  console.log("[sms-inbound] POST /api/twilio/sms (inbound + intake)");
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const p = parsed.params;
  if (process.env.SMS_PUSH_TIMING === "1") {
    const messageSid = (p.MessageSid ?? p.SmsSid ?? "").trim();
    console.log("[SMS] webhook_received", Date.now(), {
      route: "/api/twilio/sms",
      from: p.From,
      to: p.To,
      messageSid: messageSid || "(missing)",
    });
  }

  const inbound = await applyInboundTwilioSms(supabaseAdmin, p);
  if (!inbound.ok) {
    console.warn("[api/twilio/sms] inbound persist:", inbound.error);
  }

  const messageSid = (p.MessageSid ?? p.SmsSid ?? "").trim();
  if (process.env.SMS_PUSH_TIMING === "1") {
    console.log("[SMS] before_sms_intake_reply", Date.now(), { messageSid });
  }
  const intake = await processSmsIntakeReply(supabaseAdmin, {
    fromRaw: p.From ?? "",
    body: typeof p.Body === "string" ? p.Body : "",
    messageSid,
  });
  if (process.env.SMS_PUSH_TIMING === "1") {
    console.log("[SMS] after_sms_intake_reply", Date.now(), { ok: intake.ok });
  }

  if (!intake.ok) {
    console.warn("[api/twilio/sms] intake:", intake.error);
    return new NextResponse(null, { status: 200 });
  }

  const inner = intake.twimlInner;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${inner ?? ""}</Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
