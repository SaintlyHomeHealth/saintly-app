import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  findAuthUserIdByEmail,
  normalizeStaffLookupEmail,
  syncStaffProfileWithAuthUser,
  type StaffRowForAuthSync,
} from "@/lib/admin/staff-auth-link";
import {
  logStaffAuthInvite,
  provisionStaffAuthInviteForEmail,
} from "@/lib/admin/staff-auth-invite-provision";
import {
  generateServerTemporaryPassword,
  STAFF_TEMP_PASSWORD_MAX,
  STAFF_TEMP_PASSWORD_MIN,
} from "@/lib/admin/staff-auth-shared";
import { sendSms } from "@/lib/twilio/send-sms";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import {
  deliverTemporaryPasswordToEmail,
  deliverTemporaryPasswordToSms,
} from "@/lib/admin/staff-temp-credential-delivery";
import { staffAuthInviteEmailSubject, sendStaffAuthInviteEmail } from "@/lib/email/send-staff-auth-invite-email";
import { isOnboardingEmailConfigured } from "@/lib/email/send-onboarding-invite";
import { insertAuditLog } from "@/lib/audit-log";
import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/post-login-redirect";
import {
  getCanonicalAppOriginForStaffComms,
  getStaffSignInPageUrl,
} from "@/lib/auth/staff-sign-in-url";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

function firstNameFromMetaName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
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

async function persistSmsNotifyPhoneFromRequest(
  staffProfileId: string,
  raw: unknown
): Promise<{ ok: true; sms_notify_phone: string | null } | { ok: false }> {
  const str = typeof raw === "string" ? raw.trim() : "";
  const digits = str ? normalizePhone(str) : "";
  const sms_notify_phone = digits.length >= 10 ? digits : null;
  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ sms_notify_phone, updated_at: new Date().toISOString() })
    .eq("id", staffProfileId);
  if (error) {
    console.warn("[create-login] persist sms_notify_phone:", error.message);
    return { ok: false };
  }
  await insertAuditLog({
    action: "staff.sms_notify_phone_update",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: { has_value: Boolean(sms_notify_phone), source: "create_login_flow" },
  });
  return { ok: true, sms_notify_phone };
}

function welcomeSmsBody(mode: "invite" | "temp_ready", loginUrl: string): string {
  if (mode === "invite") {
    return `Saintly Home Health: check your email for an invite link. You can also sign in here: ${loginUrl}`;
  }
  return `Saintly Home Health: your login is ready. Sign in: ${loginUrl}`;
}

async function tryWelcomeSms(
  smsNotifyPhone: string | null | undefined,
  mode: "invite" | "temp_ready",
  loginUrl: string
): Promise<{ ok: boolean; detail?: string }> {
  const digits = typeof smsNotifyPhone === "string" ? normalizePhone(smsNotifyPhone) : "";
  if (digits.length < 10) {
    return { ok: false, detail: "missing_sms_phone" };
  }
  const toE164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  const sent = await sendSms({ to: toE164, body: welcomeSmsBody(mode, loginUrl) });
  if (!sent.ok) {
    return { ok: false, detail: sent.error };
  }
  return { ok: true };
}

/**
 * POST body:
 * - staffProfileId (required)
 * - mode: "invite" | "temporary_password" (default "invite")
 * - password, passwordConfirm: required when mode is temporary_password
 * - smsNotifyPhone: optional; when present, saved to staff_profiles before provisioning / SMS
 * - deliverEmail / deliverSms: for temporary_password, send credentials; for invite, deliverSms sends welcome text (sign-in link email is sent by our Resend sender, not Supabase)
 * - sendWelcomeSms: legacy, same as deliverSms when true
 * - requirePasswordChange: default true (temporary_password only)
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
    smsNotifyPhone?: unknown;
    deliverEmail?: unknown;
    deliverSms?: unknown;
    requirePasswordChange?: unknown;
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

  let smsOnRow: string | null =
    typeof (rowRaw as { sms_notify_phone?: string | null }).sms_notify_phone === "string"
      ? (rowRaw as { sms_notify_phone: string }).sms_notify_phone
      : null;

  if (Object.prototype.hasOwnProperty.call(body, "smsNotifyPhone")) {
    const persisted = await persistSmsNotifyPhoneFromRequest(staffProfileId, body.smsNotifyPhone);
    if (!persisted.ok) {
      return NextResponse.json({ ok: false, error: "phone_save_failed" }, { status: 500 });
    }
    smsOnRow = persisted.sms_notify_phone;
  }

  const deliverSms = body.deliverSms === true || body.sendWelcomeSms === true;
  const deliverEmail = body.deliverEmail === true;
  const requirePasswordChange = body.requirePasswordChange !== false;

  const metaName = typeof (rowRaw as { full_name?: string }).full_name === "string"
    ? (rowRaw as { full_name: string }).full_name
    : "";
  const origin = getCanonicalAppOriginForStaffComms();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(DEFAULT_POST_LOGIN_PATH)}`;
  const loginUrl = getStaffSignInPageUrl();

  if (mode === "temporary_password") {
    if (deliverSms && normalizePhone(smsOnRow ?? "").length < 10) {
      return NextResponse.json({ ok: false, error: "missing_sms_phone" }, { status: 400 });
    }
    if (deliverEmail && !email) {
      return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
    }

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
      .update({
        require_password_change: requirePasswordChange,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staffProfileId);

    await insertAuditLog({
      action: "staff.create_login",
      entityType: "staff_profiles",
      entityId: staffProfileId,
      metadata: { email: sync.authEmail, method: "temporary_password", outcome },
    });

    const delivery: {
      emailSent?: boolean;
      emailError?: string;
      smsSent?: boolean;
      smsError?: string;
    } = {};

    if (deliverEmail) {
      const em = await deliverTemporaryPasswordToEmail({
        workEmail: email,
        firstName: metaName,
        temporaryPassword: password,
      });
      if (em.ok) {
        delivery.emailSent = true;
      } else {
        delivery.emailError = em.detail ?? em.error;
        console.warn("[create-login] deliver email:", delivery.emailError);
      }
    }

    if (deliverSms) {
      const sm = await deliverTemporaryPasswordToSms({
        smsNotifyPhoneRaw: smsOnRow,
        temporaryPassword: password,
      });
      if (sm.ok) {
        delivery.smsSent = true;
      } else {
        delivery.smsError = sm.detail ?? sm.error;
        console.warn("[create-login] deliver sms:", delivery.smsError);
      }
    }

    revalidatePath("/admin/staff");
    revalidatePath(`/admin/staff/${staffProfileId}`);
    return NextResponse.json({
      ok: true,
      mode: "temporary_password",
      outcome,
      temporaryPassword: password,
      delivery,
    });
  }

  if (!isOnboardingEmailConfigured()) {
    return NextResponse.json(
      { ok: false, error: "resend_not_configured", detail: "Set RESEND_API_KEY and RESEND_FROM to send staff sign-in links." },
      { status: 503 }
    );
  }

  const provisioned = await provisionStaffAuthInviteForEmail({
    email,
    metaName,
    redirectTo,
  });
  if (!provisioned.ok) {
    logStaffAuthInvite("provision_fail", {
      path: "create_login_invite",
      recipient: email,
      supabaseMethod: "generateLink",
      error: provisioned.error,
      detail: provisioned.detail,
    });
    return NextResponse.json(
      { ok: false, error: provisioned.error, detail: provisioned.detail },
      { status: 502 }
    );
  }

  logStaffAuthInvite("provision_ok", {
    path: "create_login_invite",
    branch: "provision_then_resend",
    supabaseMethod: provisioned.supabaseMethod,
    recipient: email,
    templateType: "staff_auth_invite",
    supabaseAuthEmailSkipped: true,
  });

  const sync = await syncStaffProfileWithAuthUser(row, provisioned.userId);
  if (!sync.ok) {
    return NextResponse.json(
      { ok: false, error: sync.error, detail: sync.detail },
      { status: sync.error === "auth_user_linked_elsewhere" ? 409 : 500 }
    );
  }

  const firstName = firstNameFromMetaName(metaName);
  const em = await sendStaffAuthInviteEmail({
    to: email,
    firstName,
    signInUrl: provisioned.actionLink,
  });
  if (!em.ok) {
    logStaffAuthInvite("invite_email_fail", {
      path: "create_login_invite",
      recipient: email,
      emailProvider: "resend",
      subject: staffAuthInviteEmailSubject(),
      templateType: "staff_auth_invite",
      error: em.error,
    });
    return NextResponse.json(
      { ok: false, error: "invite_email_failed", detail: em.error },
      { status: 502 }
    );
  }
  logStaffAuthInvite("invite_email_ok", {
    path: "create_login_invite",
    recipient: email,
    emailProvider: "resend",
    subject: staffAuthInviteEmailSubject(),
    templateType: "staff_auth_invite",
  });

  await insertAuditLog({
    action: "staff.create_login",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: {
      email: sync.authEmail,
      method: "invite",
      outcome: "invite_linked",
      invite_email: "resend",
      supabase_link_kind: provisioned.supabaseMethod,
    },
  });

  const delivery: { emailSent?: boolean; smsSent?: boolean; smsError?: string; emailProvider?: string } = {
    emailSent: true,
    emailProvider: "resend",
  };

  if (deliverSms) {
    if (normalizePhone(smsOnRow ?? "").length < 10) {
      return NextResponse.json({ ok: false, error: "missing_sms_phone" }, { status: 400 });
    }
    const sm = await tryWelcomeSms(smsOnRow, "invite", loginUrl);
    if (sm.ok) {
      delivery.smsSent = true;
    } else {
      delivery.smsError = sm.detail;
      console.warn("[create-login] welcome sms (invite):", sm.detail);
    }
  }

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffProfileId}`);
  return NextResponse.json({
    ok: true,
    mode: "invite",
    outcome: "invite_linked",
    delivery,
  });
}
