import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin/require-admin-api";
import { purchaseTwilioNumberAndSaveToInventory } from "@/lib/twilio/admin-purchase-twilio-number";

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

  const phoneNumber =
    typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 200)
      : null;

  if (!phoneNumber) {
    return NextResponse.json({ error: "phoneNumber is required." }, { status: 400 });
  }

  const result = await purchaseTwilioNumberAndSaveToInventory({
    phoneNumberRaw: phoneNumber,
    label,
    numberType: "staff_direct",
    assignedByUserId: gate.auth.user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        twilioSid: result.twilioSid,
        phoneNumber: result.phoneNumber,
      },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    phoneNumber: result.phoneNumber,
    twilioSid: result.twilioSid,
  });
}
