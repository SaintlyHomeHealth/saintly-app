import { NextResponse } from "next/server";

import {
  normalizeStaffLookupEmail,
  STAFF_TEMP_PASSWORD_MAX,
  STAFF_TEMP_PASSWORD_MIN,
} from "@/lib/admin/staff-auth-shared";
import { sendStaffAccessCredentialsEmail } from "@/lib/email/send-staff-access-credentials-email";
import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { sendSms } from "@/lib/twilio/send-sms";
import { getStaffSignInPageUrl } from "@/lib/auth/staff-sign-in-url";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

/**
 * POST { staffProfileId, temporaryPassword, channel: "sms" | "email" }
 * Sends the one-time temporary password to the staff work email or Dispatch / welcome SMS #.
 */
export async function POST(req: Request) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: {
    staffProfileId?: unknown;
    temporaryPassword?: unknown;
    channel?: unknown;
    smsNotifyPhone?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const staffProfileId =
    typeof body.staffProfileId === "string" ? body.staffProfileId.trim() : "";
  const temporaryPassword =
    typeof body.temporaryPassword === "string" ? body.temporaryPassword.trim() : "";
  const channel = body.channel === "email" ? "email" : body.channel === "sms" ? "sms" : null;

  if (!staffProfileId || !temporaryPassword || !channel) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  if (
    temporaryPassword.length < STAFF_TEMP_PASSWORD_MIN ||
    temporaryPassword.length > STAFF_TEMP_PASSWORD_MAX
  ) {
    return NextResponse.json({ ok: false, error: "invalid_password_length" }, { status: 400 });
  }

  if (channel === "sms" && Object.prototype.hasOwnProperty.call(body, "smsNotifyPhone")) {
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
      metadata: { has_value: Boolean(sms_notify_phone), source: "send_temp_credentials" },
    });
  }

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, email, sms_notify_phone, full_name")
    .eq("id", staffProfileId)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 404 });
  }

  const loginUrl = getStaffSignInPageUrl();
  const firstName =
    typeof row.full_name === "string" && row.full_name.trim()
      ? row.full_name.trim().split(/\s+/)[0] ?? "there"
      : "there";

  if (channel === "sms") {
    const rawPhone = typeof row.sms_notify_phone === "string" ? row.sms_notify_phone : "";
    const digits = normalizePhone(rawPhone);
    if (digits.length < 10) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_sms_phone",
          detail: "Save a Dispatch / welcome SMS number on this staff row first.",
        },
        { status: 400 }
      );
    }
    const toE164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    const text = `Saintly Home Health: your temporary sign-in password is ${temporaryPassword}. Sign in: ${loginUrl} — you may be asked to change it after signing in.`;
    const sent = await sendSms({ to: toE164, body: text });
    if (!sent.ok) {
      return NextResponse.json({ ok: false, error: "sms_failed", detail: sent.error }, { status: 502 });
    }

    await insertAuditLog({
      action: "staff.temp_credentials_sms",
      entityType: "staff_profiles",
      entityId: staffProfileId,
      metadata: {},
    });

    return NextResponse.json({ ok: true, channel: "sms" });
  }

  const email = normalizeStaffLookupEmail(row.email);
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "missing_email", detail: "Add a work email to this staff row first." },
      { status: 400 }
    );
  }

  const emailed = await sendStaffAccessCredentialsEmail({
    to: email,
    firstName,
    loginUrl,
    temporaryPassword,
  });

  if (!emailed.ok) {
    return NextResponse.json(
      { ok: false, error: "email_failed", detail: emailed.error },
      { status: emailed.error.includes("not configured") ? 503 : 502 }
    );
  }

  await insertAuditLog({
    action: "staff.temp_credentials_email",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: {},
  });

  return NextResponse.json({ ok: true, channel: "email" });
}
