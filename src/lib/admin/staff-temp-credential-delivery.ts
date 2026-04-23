import "server-only";

import {
  normalizeStaffLookupEmail,
  STAFF_TEMP_PASSWORD_MAX,
  STAFF_TEMP_PASSWORD_MIN,
} from "@/lib/admin/staff-auth-shared";
import { sendStaffAccessCredentialsEmail } from "@/lib/email/send-staff-access-credentials-email";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { sendSms } from "@/lib/twilio/send-sms";

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

export type DeliverTempPasswordResult = { ok: true } | { ok: false; error: string; detail?: string };

export async function deliverTemporaryPasswordToEmail(input: {
  workEmail: string | null | undefined;
  firstName: string;
  temporaryPassword: string;
}): Promise<DeliverTempPasswordResult> {
  const email = normalizeStaffLookupEmail(input.workEmail ?? null);
  if (!email) {
    return { ok: false, error: "missing_email", detail: "Add a work email to this staff row first." };
  }
  const loginUrl = `${appOrigin()}/login`;
  const firstName = input.firstName.trim() || "there";
  const emailed = await sendStaffAccessCredentialsEmail({
    to: email,
    firstName,
    loginUrl,
    temporaryPassword: input.temporaryPassword,
  });
  if (!emailed.ok) {
    return { ok: false, error: "email_failed", detail: emailed.error };
  }
  return { ok: true };
}

export async function deliverTemporaryPasswordToSms(input: {
  smsNotifyPhoneRaw: string | null | undefined;
  temporaryPassword: string;
}): Promise<DeliverTempPasswordResult> {
  if (
    input.temporaryPassword.length < STAFF_TEMP_PASSWORD_MIN ||
    input.temporaryPassword.length > STAFF_TEMP_PASSWORD_MAX
  ) {
    return { ok: false, error: "invalid_password_length" };
  }
  const rawPhone = typeof input.smsNotifyPhoneRaw === "string" ? input.smsNotifyPhoneRaw : "";
  const digits = normalizePhone(rawPhone);
  if (digits.length < 10) {
    return {
      ok: false,
      error: "missing_sms_phone",
      detail: "Save a Dispatch / welcome SMS number on this staff row first.",
    };
  }
  const toE164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  const loginUrl = `${appOrigin()}/login`;
  const text = `Saintly Home Health: your temporary sign-in password is ${input.temporaryPassword}. Sign in: ${loginUrl} — you may be asked to change it after signing in.`;
  const sent = await sendSms({ to: toE164, body: text });
  if (!sent.ok) {
    return { ok: false, error: "sms_failed", detail: sent.error };
  }
  return { ok: true };
}
