import { NextRequest, NextResponse } from "next/server";

import { updateFaxFromStatusWebhook } from "@/lib/fax/fax-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const sharedSecret = process.env.TELNYX_FAX_WEBHOOK_SECRET;
  if (!sharedSecret) {
    // TODO: Replace with Telnyx public-key signature verification once the signing key is configured.
    return process.env.NODE_ENV !== "production";
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

  const result = await updateFaxFromStatusWebhook(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Fax status update failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, fax_id: result.faxId });
}
