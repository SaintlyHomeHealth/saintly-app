import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin/require-admin-api";
import { supabaseAdmin } from "@/lib/admin";
import { assignTwilioPhoneNumberToStaffUser } from "@/lib/twilio/twilio-phone-number-repo";

export async function POST(req: Request) {
  const gate = await requireAdminApiSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
  const assignToUserId = typeof body.assignToUserId === "string" ? body.assignToUserId.trim() : "";

  const result = await assignTwilioPhoneNumberToStaffUser(supabaseAdmin, {
    phoneNumberId,
    assignToUserId,
    assignedByUserId: gate.auth.user.id,
    reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "assign",
    syncDedicatedOutboundE164: body.syncDedicatedOutboundE164 === true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
