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
  const assignToUserId = typeof body.assignToUserId === "string" ? body.assignToUserId.trim() : "";
  if (!UUID_RE.test(phoneNumberId) || !UUID_RE.test(assignToUserId)) {
    return NextResponse.json({ error: "Invalid phoneNumberId or assignToUserId." }, { status: 400 });
  }

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("twilio_phone_numbers")
    .select("id, status, assigned_user_id, assigned_staff_profile_id")
    .eq("id", phoneNumberId)
    .maybeSingle();

  if (loadErr || !row?.id) {
    return NextResponse.json({ error: "Number not found." }, { status: 404 });
  }
  if (row.status === "retired") {
    return NextResponse.json({ error: "Cannot assign a retired number." }, { status: 400 });
  }
  if (row.status === "assigned" && row.assigned_user_id && String(row.assigned_user_id) !== assignToUserId) {
    return NextResponse.json({ error: "Number is already assigned. Use reassign or unassign first." }, { status: 409 });
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id, role, is_active")
    .eq("user_id", assignToUserId)
    .maybeSingle();

  if (profErr || !profile?.id || !profile.user_id) {
    return NextResponse.json({ error: "Staff profile not found for that user." }, { status: 400 });
  }
  if (profile.is_active === false) {
    return NextResponse.json({ error: "Cannot assign to inactive staff." }, { status: 400 });
  }
  if (profile.role === "read_only") {
    return NextResponse.json({ error: "Cannot assign numbers to read-only users." }, { status: 400 });
  }

  if (
    row.status === "assigned" &&
    row.assigned_user_id &&
    String(row.assigned_user_id).trim() === assignToUserId
  ) {
    return NextResponse.json({ ok: true });
  }

  const { data: other } = await supabaseAdmin
    .from("twilio_phone_numbers")
    .select("id")
    .eq("assigned_user_id", assignToUserId)
    .eq("status", "assigned")
    .neq("id", phoneNumberId)
    .maybeSingle();

  if (other?.id) {
    return NextResponse.json(
      { error: "That staff member already has an assigned Twilio number. Unassign it first." },
      { status: 409 }
    );
  }

  const prevUser =
    row.assigned_user_id != null && String(row.assigned_user_id).trim() !== ""
      ? String(row.assigned_user_id).trim()
      : null;

  await logTwilioNumberAssignment(supabaseAdmin, {
    phoneNumberId,
    assignedFromUserId: prevUser,
    assignedToUserId: assignToUserId,
    assignedByUserId: gate.auth.user.id,
    reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "assign",
  });

  const { error: upErr } = await supabaseAdmin
    .from("twilio_phone_numbers")
    .update({
      assigned_user_id: assignToUserId,
      assigned_staff_profile_id: profile.id,
      status: "assigned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", phoneNumberId);

  if (upErr) {
    console.warn("[api/admin/twilio/phone-numbers/assign]:", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
