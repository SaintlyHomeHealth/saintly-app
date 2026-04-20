import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  generateServerTemporaryPassword,
  STAFF_TEMP_PASSWORD_MAX,
  STAFF_TEMP_PASSWORD_MIN,
} from "@/lib/admin/staff-auth-shared";
import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

export async function POST(req: Request) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: {
    staffProfileId?: unknown;
    password?: unknown;
    passwordConfirm?: unknown;
    autoGenerate?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const staffProfileId =
    typeof body.staffProfileId === "string" ? body.staffProfileId.trim() : "";
  if (!staffProfileId) {
    return NextResponse.json({ ok: false, error: "missing_staff_profile_id" }, { status: 400 });
  }

  const autoGenerate = body.autoGenerate === true;
  let password = typeof body.password === "string" ? body.password : "";
  let passwordConfirm = typeof body.passwordConfirm === "string" ? body.passwordConfirm : "";

  if (autoGenerate || password.trim() === "") {
    password = generateServerTemporaryPassword();
    passwordConfirm = password;
  }

  if (password.length < STAFF_TEMP_PASSWORD_MIN || password.length > STAFF_TEMP_PASSWORD_MAX) {
    return NextResponse.json({ ok: false, error: "password_requirements" }, { status: 400 });
  }
  if (password !== passwordConfirm) {
    return NextResponse.json({ ok: false, error: "password_mismatch" }, { status: 400 });
  }

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id, email")
    .eq("id", staffProfileId)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 404 });
  }

  const userId = typeof row.user_id === "string" ? row.user_id : null;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_login_to_reset" }, { status: 400 });
  }

  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });

  if (updErr) {
    console.warn("[api/admin/staff/reset-password]", updErr.message);
    return NextResponse.json(
      { ok: false, error: "auth_update_failed", detail: updErr.message },
      { status: 502 }
    );
  }

  await supabaseAdmin
    .from("staff_profiles")
    .update({ require_password_change: true, updated_at: new Date().toISOString() })
    .eq("id", staffProfileId);

  await insertAuditLog({
    action: "staff.reset_password",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: { auto_generated: autoGenerate },
  });

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffProfileId}`);
  return NextResponse.json({
    ok: true,
    outcome: "password_reset_success",
    temporaryPassword: password,
  });
}
