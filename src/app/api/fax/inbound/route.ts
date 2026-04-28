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

function inboundFaxPayloadSummary(body: unknown) {
  const fax = extractTelnyxFax(body);
  return {
    fax_id: fax.telnyxFaxId,
    from_number: fax.fromNumber,
    to_number: fax.toNumber,
    media_url_exists: Boolean(fax.mediaUrl),
  };
}

function inboundFaxErrorResponse(message: string) {
  return NextResponse.json(
    {
      error: process.env.NODE_ENV === "production" ? "Inbound fax processing failed" : message,
    },
    { status: 500 }
  );
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

  try {
    const result = await upsertInboundFaxFromWebhook(body);
    if (!result.ok) {
      const message = result.error ?? "Inbound fax processing failed";
      console.error("[fax/inbound] error", {
        error: message,
        payloadSummary: inboundFaxPayloadSummary(body),
      });
      return inboundFaxErrorResponse(message);
    }

    return NextResponse.json({ ok: true, fax_id: result.faxId, conversation_id: result.conversationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inbound fax processing failed";
    console.error("[fax/inbound] error", {
      error: message,
      stack: err instanceof Error ? err.stack : null,
      payloadSummary: inboundFaxPayloadSummary(body),
    });
    return inboundFaxErrorResponse(message);
  }
}
