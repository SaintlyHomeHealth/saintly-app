import { NextResponse } from "next/server";

import { syncSharedMailbox } from "@/lib/email-marketing/gmail/sync";
import { isGmailInboxConnected } from "@/lib/email-marketing/gmail/client";
import { requireEmailMarketingStaff } from "@/lib/email-marketing/require-email-marketing-staff";

export const runtime = "nodejs";

export async function POST() {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const connected = await isGmailInboxConnected();
  if (!connected) {
    return NextResponse.json({ error: "Gmail inbox is not connected." }, { status: 503 });
  }

  try {
    const result = await syncSharedMailbox();
    return NextResponse.json({
      ok: true,
      syncedMessages: result.syncedMessages,
      updatedThreads: result.updatedThreads,
      skipped: result.skipped,
      lastHistoryId: result.lastHistoryId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}
