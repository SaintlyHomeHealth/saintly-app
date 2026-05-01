import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin/require-admin-api";
import { supabaseAdmin } from "@/lib/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Moves historical SMS ownership from one staff user to another for one Twilio number (explicit admin action).
 */
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
  const fromUserId = typeof body.fromUserId === "string" ? body.fromUserId.trim() : "";
  const toUserId = typeof body.toUserId === "string" ? body.toUserId.trim() : "";

  if (!UUID_RE.test(phoneNumberId) || !UUID_RE.test(fromUserId) || !UUID_RE.test(toUserId)) {
    return NextResponse.json(
      { error: "Select a Twilio number and both staff members (from / to)." },
      { status: 400 }
    );
  }
  if (fromUserId === toUserId) {
    return NextResponse.json(
      { error: "Transfer from and transfer to must be different staff members." },
      { status: 400 }
    );
  }

  const { data: toProfile, error: tpErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id")
    .eq("user_id", toUserId)
    .maybeSingle();

  if (tpErr || !toProfile?.id) {
    return NextResponse.json({ error: "Target staff profile not found." }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabaseAdmin
    .from("messages")
    .update({
      owner_user_id: toUserId,
      owner_staff_profile_id: toProfile.id,
    })
    .eq("twilio_phone_number_id", phoneNumberId)
    .eq("owner_user_id", fromUserId)
    .select("id");

  if (upErr) {
    console.warn("[api/admin/twilio/phone-numbers/transfer-history]:", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updatedCount: updated?.length ?? 0 });
}
