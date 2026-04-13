import { NextRequest, NextResponse } from "next/server";

import { escapeXml } from "@/lib/twilio/softphone-conference";

/**
 * TwiML played to the PSTN participant while on hold (Twilio Participant holdUrl).
 * Configure longer audio via TWILIO_SOFTPHONE_HOLD_AUDIO_URL (HTTPS MP3/WAV).
 */
export async function GET(req: NextRequest) {
  const audioUrl =
    process.env.TWILIO_SOFTPHONE_HOLD_AUDIO_URL?.trim() ||
    "https://demo.twilio.com/docs/classic.mp3";
  const safe = escapeXml(audioUrl);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${safe}</Play>
</Response>`.trim();
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
