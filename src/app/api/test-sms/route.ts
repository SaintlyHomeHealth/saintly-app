import { NextResponse } from "next/server";
import twilio from "twilio";

import { resolveDefaultTwilioSmsFromOrMsid } from "@/lib/twilio/sms-from-numbers";

export async function GET() {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

  const fromOrMsid = resolveDefaultTwilioSmsFromOrMsid();
  const params: { body: string; to: string; from?: string; messagingServiceSid?: string } = {
    body: "Test SMS from Saintly ✅",
    to: process.env.TWILIO_ALERT_TO!,
  };
  if (fromOrMsid.startsWith("MG")) {
    params.messagingServiceSid = fromOrMsid;
  } else {
    params.from = fromOrMsid;
  }

  await client.messages.create(params);

  return NextResponse.json({ success: true });
}
