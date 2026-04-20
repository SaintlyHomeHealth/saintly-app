import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { insertAuditLog } from "@/lib/audit-log";
import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/post-login-redirect";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

/**
 * Re-sends Supabase invite email for an existing linked auth user (recovery / nudge).
 */
export async function POST(req: Request) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { staffProfileId?: unknown };
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

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id, email, full_name")
    .eq("id", staffProfileId)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 404 });
  }

  const userId = typeof row.user_id === "string" ? row.user_id : null;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_login" }, { status: 400 });
  }

  const email = normalizeStaffLookupEmail(row.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
  }

  const metaName = typeof row.full_name === "string" ? row.full_name : "";
  const redirectTo = `${appOrigin()}/auth/callback?next=${encodeURIComponent(DEFAULT_POST_LOGIN_PATH)}`;

  const inviteRes = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: metaName },
  });

  if (inviteRes.error) {
    const gl = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: { full_name: metaName } },
    });
    if (gl.error) {
      console.warn("[resend-invite]", inviteRes.error.message, gl.error.message);
      return NextResponse.json(
        { ok: false, error: "invite_failed", detail: inviteRes.error.message || gl.error.message },
        { status: 502 }
      );
    }
  }

  await insertAuditLog({
    action: "staff.resend_invite",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: { email },
  });

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffProfileId}`);
  return NextResponse.json({ ok: true });
}
