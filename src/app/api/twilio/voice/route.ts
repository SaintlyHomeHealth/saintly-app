import { NextResponse } from "next/server";

const TWIML_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Saintly test successful. The webhook is working.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>`;

function twimlOkResponse() {
  return new NextResponse(TWIML_RESPONSE, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export function GET() {
  return twimlOkResponse();
}

export function POST() {
  return twimlOkResponse();
}
