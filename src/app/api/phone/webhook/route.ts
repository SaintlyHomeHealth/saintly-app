import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { upsertPhoneCallFromWebhook, type PhoneWebhookBody } from "@/lib/phone/log-call";
import { isPhoneWebhookAuthorized } from "@/lib/phone/webhook-auth";

/**
 * Provider-agnostic inbound webhook (Phase 0). Twilio will POST here later with the same
 * secret header and a mapped JSON body.
 */
export async function POST(req: NextRequest) {
  if (!isPhoneWebhookAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PhoneWebhookBody;
  try {
    body = (await req.json()) as PhoneWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await upsertPhoneCallFromWebhook(supabaseAdmin, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, call_id: result.callId });
}
