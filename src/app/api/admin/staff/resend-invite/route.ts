import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  generateStaffResendSignInLink,
  logStaffAuthInvite,
} from "@/lib/admin/staff-auth-invite-provision";
import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { staffAuthInviteEmailSubject, sendStaffAuthInviteEmail } from "@/lib/email/send-staff-auth-invite-email";
import { isOnboardingEmailConfigured } from "@/lib/email/send-onboarding-invite";
import { insertAuditLog } from "@/lib/audit-log";
import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/post-login-redirect";
import { supabaseAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { sendSms } from "@/lib/twilio/send-sms";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

/**
 * Re-sends a sign-in link via our Resend sender (Supabase Auth does not email the user here).
 */
export async function POST(req: Request) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { staffProfileId?: unknown; smsNotifyPhone?: unknown; sendWelcomeSms?: unknown };
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

  const sendWelcomeSms = body.sendWelcomeSms === true;

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id, email, full_name, sms_notify_phone")
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

  let smsOnRow: string | null =
    typeof row.sms_notify_phone === "string" ? row.sms_notify_phone : null;

  if (Object.prototype.hasOwnProperty.call(body, "smsNotifyPhone")) {
    const str = typeof body.smsNotifyPhone === "string" ? body.smsNotifyPhone.trim() : "";
    const digits = str ? normalizePhone(str) : "";
    const sms_notify_phone = digits.length >= 10 ? digits : null;
    const { error: upErr } = await supabaseAdmin
      .from("staff_profiles")
      .update({ sms_notify_phone, updated_at: new Date().toISOString() })
      .eq("id", staffProfileId);
    if (upErr) {
      return NextResponse.json({ ok: false, error: "phone_save_failed" }, { status: 500 });
    }
    await insertAuditLog({
      action: "staff.sms_notify_phone_update",
      entityType: "staff_profiles",
      entityId: staffProfileId,
      metadata: { has_value: Boolean(sms_notify_phone), source: "resend_invite_flow" },
    });
    smsOnRow = sms_notify_phone;
  }

  if (sendWelcomeSms && normalizePhone(smsOnRow ?? "").length < 10) {
    return NextResponse.json({ ok: false, error: "missing_sms_phone" }, { status: 400 });
  }

  const metaName = typeof row.full_name === "string" ? row.full_name : "";
  const firstName = metaName.trim().split(/\s+/)[0] || "there";
  const redirectTo = `${appOrigin()}/auth/callback?next=${encodeURIComponent(DEFAULT_POST_LOGIN_PATH)}`;

  if (!isOnboardingEmailConfigured()) {
    return NextResponse.json(
      { ok: false, error: "resend_not_configured", detail: "Set RESEND_API_KEY and RESEND_FROM to send sign-in links." },
      { status: 503 }
    );
  }

  const linkRes = await generateStaffResendSignInLink({ email, metaName, redirectTo });
  if (!linkRes.ok) {
    logStaffAuthInvite("resend_link_fail", {
      path: "resend_invite",
      recipient: email,
      supabaseMethod: "generateLink_magiclink",
      error: linkRes.error,
      detail: linkRes.detail,
    });
    return NextResponse.json(
      { ok: false, error: "invite_failed", detail: linkRes.detail },
      { status: 502 }
    );
  }
  logStaffAuthInvite("resend_link_ok", {
    path: "resend_invite",
    branch: "magiclink_then_resend",
    recipient: email,
    supabaseMethod: linkRes.supabaseMethod,
    templateType: "staff_auth_invite",
    supabaseAuthEmailSkipped: true,
  });

  const em = await sendStaffAuthInviteEmail({
    to: email,
    firstName,
    signInUrl: linkRes.actionLink,
  });
  if (!em.ok) {
    logStaffAuthInvite("invite_email_fail", {
      path: "resend_invite",
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
    path: "resend_invite",
    recipient: email,
    emailProvider: "resend",
    subject: staffAuthInviteEmailSubject(),
    templateType: "staff_auth_invite",
  });

  await insertAuditLog({
    action: "staff.resend_invite",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: { email, invite_email: "resend" },
  });

  const delivery: { smsSent?: boolean; smsError?: string } = {};

  if (sendWelcomeSms) {
    const loginUrl = `${appOrigin()}/login`;
    const digits = normalizePhone(smsOnRow ?? "");
    const toE164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    const text = `Saintly Home Health: check your email for an invite link. You can also sign in here: ${loginUrl}`;
    const sent = await sendSms({ to: toE164, body: text });
    if (sent.ok) {
      delivery.smsSent = true;
    } else {
      delivery.smsError = sent.error;
    }
  }

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffProfileId}`);
  return NextResponse.json({ ok: true, delivery });
}
