import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin/require-admin-api";
import { supabaseAdmin } from "@/lib/admin";
import { logTwilioNumberAssignment } from "@/lib/twilio/twilio-phone-number-repo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!UUID_RE.test(phoneNumberId)) {
    return NextResponse.json({ error: "Invalid phoneNumberId." }, { status: 400 });
  }

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("twilio_phone_numbers")
    .select("id, assigned_user_id, status, is_primary_company_number")
    .eq("id", phoneNumberId)
    .maybeSingle();

  if (loadErr || !row?.id) {
    return NextResponse.json({ error: "Number not found." }, { status: 404 });
  }
  if (row.is_primary_company_number === true) {
    return NextResponse.json({ error: "Cannot retire the primary company number row." }, { status: 400 });
  }

  const prev =
    row.assigned_user_id != null && String(row.assigned_user_id).trim() !== ""
      ? String(row.assigned_user_id).trim()
      : null;

  await logTwilioNumberAssignment(supabaseAdmin, {
    phoneNumberId,
    assignedFromUserId: prev,
    assignedToUserId: null,
    assignedByUserId: gate.auth.user.id,
    reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "retire",
  });

  const { error: upErr } = await supabaseAdmin
    .from("twilio_phone_numbers")
    .update({
      assigned_user_id: null,
      assigned_staff_profile_id: null,
      status: "retired",
      sms_enabled: false,
      voice_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", phoneNumberId);

  if (upErr) {
    console.warn("[api/admin/twilio/phone-numbers/retire]:", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
