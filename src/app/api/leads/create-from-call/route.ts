import { NextResponse } from "next/server";

import { createLeadFromPhoneCallId } from "@/app/admin/phone/actions";

type Body = {
  phoneCallId?: string;
  phone?: string;
  source?: string;
  /** Facebook click id from landing page URL (`?fbclid=`). */
  fbclid?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } as const, { status: 400 });
  }

  const phoneCallId = typeof body.phoneCallId === "string" ? body.phoneCallId.trim() : "";
  if (!phoneCallId) {
    return NextResponse.json({ ok: false, error: "missing_phone_call_id" } as const, { status: 400 });
  }

  const fbclidRaw = typeof body.fbclid === "string" ? body.fbclid : "";
  const result = await createLeadFromPhoneCallId(phoneCallId, fbclidRaw ? { fbclid: fbclidRaw } : undefined);

  if (!result.ok) {
    let status = 400;
    if (result.error === "forbidden") status = 403;
    else if (result.error === "call_not_found") status = 404;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
