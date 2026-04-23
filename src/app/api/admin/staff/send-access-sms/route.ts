import { NextResponse } from "next/server";

import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { sendSms } from "@/lib/twilio/send-sms";
import { getStaffSignInPageUrl } from "@/lib/auth/staff-sign-in-url";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

export async function POST(req: Request) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { staffProfileId?: unknown; variant?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const staffProfileId =
    typeof body.staffProfileId === "string" ? body.staffProfileId.trim() : "";
  const variant = typeof body.variant === "string" ? body.variant.trim() : "welcome";
  if (!staffProfileId) {
    return NextResponse.json({ ok: false, error: "missing_staff_profile_id" }, { status: 400 });
  }

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, email, sms_notify_phone, full_name")
    .eq("id", staffProfileId)
    .maybeSingle();

  if (loadErr || !row) {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 404 });
  }

  const rawPhone = typeof row.sms_notify_phone === "string" ? row.sms_notify_phone : "";
  const digits = normalizePhone(rawPhone);
  if (digits.length < 10) {
    return NextResponse.json({ ok: false, error: "missing_sms_phone" }, { status: 400 });
  }
  const toE164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  const loginUrl = getStaffSignInPageUrl();
  const name = typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : "there";
  const email = normalizeStaffLookupEmail(row.email);

  let text: string;
  if (variant === "access") {
    text = `Saintly Home Health: ${name}, you now have access to the Saintly app. Sign in: ${loginUrl}`;
  } else {
    text = `Hi ${name}, welcome to Saintly Home Health. Your work email on file: ${email || "—"}. Sign in: ${loginUrl}`;
  }

  const sent = await sendSms({ to: toE164, body: text });
  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: "sms_failed", detail: sent.error }, { status: 502 });
  }

  await insertAuditLog({
    action: "staff.access_sms",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: { variant },
  });

  return NextResponse.json({ ok: true });
}
