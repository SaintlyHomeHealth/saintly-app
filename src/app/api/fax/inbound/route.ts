import { NextRequest, NextResponse } from "next/server";

import { extractTelnyxFax, upsertInboundFaxFromWebhook } from "@/lib/fax/fax-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const sharedSecret = process.env.TELNYX_FAX_WEBHOOK_SECRET;
  if (!sharedSecret) {
    console.info("[fax webhook] TELNYX_FAX_WEBHOOK_SECRET not set; verification bypassed for inbound webhook.");
    return true;
  }
  const headerSecret = req.headers.get("x-webhook-secret") ?? req.headers.get("x-telnyx-webhook-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return headerSecret === sharedSecret || bearer === sharedSecret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fax = extractTelnyxFax(body);
  console.log("[fax/inbound] request_received", {
    payload: body,
    fax_id: fax.telnyxFaxId,
    from_number: fax.fromNumber,
    to_number: fax.toNumber,
    media_url: fax.mediaUrl,
  });

  const result = await upsertInboundFaxFromWebhook(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Inbound fax processing failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, fax_id: result.faxId, conversation_id: result.conversationId });
}
