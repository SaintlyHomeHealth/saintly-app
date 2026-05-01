import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin/require-admin-api";
import { syncTwilioIncomingPhoneNumbersIntoDb } from "@/lib/twilio/sync-twilio-incoming-numbers";

export async function POST() {
  const gate = await requireAdminApiSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const result = await syncTwilioIncomingPhoneNumbersIntoDb();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    inserted: result.inserted,
    updated: result.updated,
  });
}
