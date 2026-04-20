import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  findAuthUserIdByEmail,
  normalizeStaffLookupEmail,
  syncStaffProfileWithAuthUser,
  type StaffRowForAuthSync,
} from "@/lib/admin/staff-auth-link";
import {
  generateServerTemporaryPassword,
  STAFF_TEMP_PASSWORD_MAX,
  STAFF_TEMP_PASSWORD_MIN,
} from "@/lib/admin/staff-auth-shared";
import { sendSms } from "@/lib/twilio/send-sms";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

async function resolveInviteUserId(
  email: string,
  metaName: string,
  redirectTo: string
): Promise<{ userId: string } | { error: string; detail?: string }> {
  const inviteRes = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: metaName },
  });

  let newUserId: string | null = inviteRes.data?.user?.id ?? null;

  if (!newUserId) {
    newUserId = await findAuthUserIdByEmail(email);
  }

  if (!newUserId) {
    const gl = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: { full_name: metaName },
      },
    });
    if (gl.error) {
      console.warn(
        "[api/admin/staff/create-login] invite:",
        inviteRes.error?.message ?? gl.error.message
      );
      return {
        error: "auth_provision_failed",
        detail: inviteRes.error?.message ?? gl.error.message,
      };
    }
    newUserId = gl.data?.user?.id ?? null;
  }

  if (!newUserId) {
    return { error: "auth_provision_failed" };
  }

  return { userId: newUserId };
}

/** Ensures password sign-in works immediately (GoTrue email confirmation). */
async function ensureAuthUserEmailConfirmed(userId: string): Promise<{ ok: true } | { ok: false; detail: string }> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (error) {
    return { ok: false, detail: error.message };
  }
  return { ok: true };
}

function rowForSync(r: Record<string, unknown>): StaffRowForAuthSync | null {
  const id = typeof r.id === "string" ? r.id : null;
  const role = typeof r.role === "string" ? r.role : null;
  if (!id || !role) return null;
  return {
    id,
    user_id: typeof r.user_id === "string" ? r.user_id : null,
    email: typeof r.email === "string" ? r.email : null,
    role,
    is_active: r.is_active !== false,
    phone_access_enabled: r.phone_access_enabled === true,
    inbound_ring_enabled: r.inbound_ring_enabled === true,
  };
}

/**
 * POST body:
 * - staffProfileId (required)
 * - mode: "invite" | "temporary_password" (default "invite")
 * - password, passwordConfirm: required when mode is temporary_password
 */
export async function POST(req: Request) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: {
    staffProfileId?: unknown;
    mode?: unknown;
    password?: unknown;
    passwordConfirm?: unknown;
    autoGeneratePassword?: unknown;
    sendWelcomeSms?: unknown;
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

  const modeRaw = typeof body.mode === "string" ? body.mode.trim() : "invite";
  const mode = modeRaw === "temporary_password" ? "temporary_password" : "invite";

  const { data: rowRaw, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select(
      "id, user_id, email, full_name, role, is_active, phone_access_enabled, inbound_ring_enabled, sms_notify_phone"
    )
    .eq("id", staffProfileId)
    .maybeSingle();

  if (loadErr || !rowRaw) {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 404 });
  }

  const row = rowForSync(rowRaw as Record<string, unknown>);
  if (!row) {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 404 });
  }

  if (row.user_id) {
    return NextResponse.json({ ok: false, error: "already_has_login" }, { status: 409 });
  }

  const email = normalizeStaffLookupEmail(row.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
  }

  const metaName = typeof (rowRaw as { full_name?: string }).full_name === "string"
    ? (rowRaw as { full_name: string }).full_name
    : "";
  const redirectTo = `${appOrigin()}/auth/callback?next=${encodeURIComponent("/admin")}`;

  if (mode === "temporary_password") {
    const autoGen = body.autoGeneratePassword === true;
    let password = typeof body.password === "string" ? body.password : "";
    let passwordConfirm = typeof body.passwordConfirm === "string" ? body.passwordConfirm : "";

    if (autoGen || password.trim() === "") {
      password = generateServerTemporaryPassword();
      passwordConfirm = password;
    }

    if (password.length < STAFF_TEMP_PASSWORD_MIN || password.length > STAFF_TEMP_PASSWORD_MAX) {
      return NextResponse.json(
        { ok: false, error: "password_requirements" },
        { status: 400 }
      );
    }
    if (password !== passwordConfirm) {
      return NextResponse.json({ ok: false, error: "password_mismatch" }, { status: 400 });
    }

    const existingId = await findAuthUserIdByEmail(email);
    let authUserId: string;
    let outcome: "login_created_and_linked" | "login_relinked_existing_auth";

    if (existingId) {
      const upd = await supabaseAdmin.auth.admin.updateUserById(existingId, {
        password,
        email_confirm: true,
      });
      if (upd.error) {
        console.warn("[api/admin/staff/create-login] updateUserById:", upd.error.message);
        return NextResponse.json(
          {
            ok: false,
            error: "auth_provision_failed",
            detail: upd.error.message,
          },
          { status: 502 }
        );
      }
      authUserId = existingId;
      outcome = "login_relinked_existing_auth";
    } else {
      const cre = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: metaName },
      });

      if (cre.error || !cre.data?.user?.id) {
        console.warn("[api/admin/staff/create-login] createUser:", cre.error?.message);
        return NextResponse.json(
          {
            ok: false,
            error: "auth_provision_failed",
            detail: cre.error?.message,
          },
          { status: 502 }
        );
      }
      authUserId = cre.data.user.id;
      const confirmExtra = await ensureAuthUserEmailConfirmed(authUserId);
      if (!confirmExtra.ok) {
        console.warn("[api/admin/staff/create-login] email_confirm follow-up:", confirmExtra.detail);
        return NextResponse.json(
          {
            ok: false,
            error: "auth_provision_failed",
            detail: confirmExtra.detail,
          },
          { status: 502 }
        );
      }
      outcome = "login_created_and_linked";
    }

    const sync = await syncStaffProfileWithAuthUser(row, authUserId);
    if (!sync.ok) {
      return NextResponse.json(
        { ok: false, error: sync.error, detail: sync.detail },
        { status: sync.error === "auth_user_linked_elsewhere" ? 409 : 500 }
      );
    }

    await supabaseAdmin
      .from("staff_profiles")
      .update({ require_password_change: true, updated_at: new Date().toISOString() })
      .eq("id", staffProfileId);

    await insertAuditLog({
      action: "staff.create_login",
      entityType: "staff_profiles",
      entityId: staffProfileId,
      metadata: { email: sync.authEmail, method: "temporary_password", outcome },
    });

    const welcomeSms = body.sendWelcomeSms === true;
    if (welcomeSms) {
      const rawPhone = (rowRaw as { sms_notify_phone?: string | null }).sms_notify_phone;
      const digits = typeof rawPhone === "string" ? normalizePhone(rawPhone) : "";
      const loginUrl = `${appOrigin()}/login`;
      if (digits.length >= 10) {
        const toE164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
        const bodyText = `Saintly Home Health: your login is ready. Sign in: ${loginUrl}`;
        const sent = await sendSms({ to: toE164, body: bodyText });
        if (!sent.ok) {
          console.warn("[create-login] welcome sms:", sent.error);
        }
      }
    }

    revalidatePath("/admin/staff");
    revalidatePath(`/admin/staff/${staffProfileId}`);
    return NextResponse.json({
      ok: true,
      mode: "temporary_password",
      outcome,
      temporaryPassword: password,
    });
  }

  const resolved = await resolveInviteUserId(email, metaName, redirectTo);
  if ("error" in resolved) {
    return NextResponse.json(
      { ok: false, error: resolved.error, detail: resolved.detail },
      { status: 502 }
    );
  }

  const sync = await syncStaffProfileWithAuthUser(row, resolved.userId);
  if (!sync.ok) {
    return NextResponse.json(
      { ok: false, error: sync.error, detail: sync.detail },
      { status: sync.error === "auth_user_linked_elsewhere" ? 409 : 500 }
    );
  }

  await insertAuditLog({
    action: "staff.create_login",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: { email: sync.authEmail, method: "invite", outcome: "invite_linked" },
  });

  const welcomeSmsInvite = body.sendWelcomeSms === true;
  if (welcomeSmsInvite) {
    const rawPhone = (rowRaw as { sms_notify_phone?: string | null }).sms_notify_phone;
    const digits = typeof rawPhone === "string" ? normalizePhone(rawPhone) : "";
    const loginUrl = `${appOrigin()}/login`;
    if (digits.length >= 10) {
      const toE164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
      const bodyText = `Saintly Home Health: check your email for an invite link. You can also sign in here: ${loginUrl}`;
      const sent = await sendSms({ to: toE164, body: bodyText });
      if (!sent.ok) {
        console.warn("[create-login] welcome sms (invite):", sent.error);
      }
    }
  }

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffProfileId}`);
  return NextResponse.json({
    ok: true,
    mode: "invite",
    outcome: "invite_linked",
  });
}
