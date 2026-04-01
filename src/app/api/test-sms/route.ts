import { NextResponse } from "next/server";
import twilio from "twilio";

export async function GET() {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

  await client.messages.create({
    body: "Test SMS from Saintly ✅",
    from: process.env.TWILIO_SMS_FROM!,
    to: process.env.TWILIO_ALERT_TO!,
  });

  return NextResponse.json({ success: true });
}
