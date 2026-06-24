import { NextRequest, NextResponse } from "next/server";

import { syncSharedMailbox } from "@/lib/email-marketing/gmail/sync";
import { isGmailInboxConnected } from "@/lib/email-marketing/gmail/client";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim() || process.env.EMAIL_MARKETING_SYNC_CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

/** Vercel Cron / scheduled Gmail inbox sync for admin@saintlyhomehealth.com */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connected = await isGmailInboxConnected();
  if (!connected) {
    return NextResponse.json({ ok: false, error: "Gmail inbox not connected." }, { status: 503 });
  }

  try {
    const result = await syncSharedMailbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
