import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildFacebookRecruitingLeadAdminNotificationBody,
  buildFacebookRecruitingLeadIntroSmsBody,
  extractRecruitingLeadFirstName,
  recruitingLeadAdminNotificationDedupeKey,
  recruitingLeadAdminNotificationHref,
  shouldSendFacebookRecruitingAdminNotification,
  shouldSendFacebookRecruitingIntroSms,
} from "@/lib/recruiting/facebook-recruiting-lead-shared";
import { resolveRecruitingLeadsNotifyUserIds } from "@/lib/recruiting/resolve-recruiting-leads-notify-user-ids";
import { normalizeRecruitingPhoneForStorage } from "@/lib/recruiting/recruiting-contact-normalize";
import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import {
  resolveRecruitingAdminSmsAlertSource,
  sendRecruitingAdminSmsAlert,
} from "@/lib/recruiting/recruiting-admin-sms-alert";
import { sendSms } from "@/lib/twilio/send-sms";
import { getPrimarySmsFromNumber, isSaintlyBackupSmsE164, logAltSmsSenderUsed } from "@/lib/twilio/sms-from-numbers";

const LOG = "[facebook-recruiting-lead-post-create]";

type RecruitingLeadRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  form_name: string | null;
  license_status: string | null;
  lead_type: string | null;
  raw_payload: unknown;
  normalized_phone: string | null;
  coverage_area: string | null;
  visits_per_week: string | null;
  start_date: string | null;
  auto_sms_sent_at: string | null;
  auto_sms_error: string | null;
  last_admin_notification_sent_at: string | null;
  last_admin_sms_alert_sent_at: string | null;
};

/**
 * Optional override for applicant thank-you SMS From number.
 * Falls back to `FACEBOOK_LEAD_INTRO_SMS_FROM`, then the org primary long code.
 *
 * Requires standard Twilio env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_SMS_FROM` (or default primary).
 * FCM push requires `FIREBASE_SERVICE_ACCOUNT_JSON`. Disable push with `SAINTLY_PUSH_NEW_RECRUITING_LEAD_DISABLED=1`.
 */
function resolveRecruitingIntroFromE164(): string {
  const env =
    process.env.FACEBOOK_RECRUITING_INTRO_SMS_FROM?.trim() ||
    process.env.FACEBOOK_LEAD_INTRO_SMS_FROM?.trim();
  if (env) {
    if (isSaintlyBackupSmsE164(env)) {
      logAltSmsSenderUsed("ALT SMS sender used intentionally", {
        path: "facebook_recruiting_lead_intro_sms",
        source: "env",
      });
    }
    return env;
  }
  return getPrimarySmsFromNumber().e164;
}

function phoneToE164(phone: string | null, normalizedPhone: string | null): string | null {
  const candidates = [phone, normalizedPhone].filter(Boolean) as string[];
  for (const raw of candidates) {
    const trimmed = raw.trim();
    const withPlus =
      trimmed.startsWith("+")
        ? trimmed
        : trimmed.length === 10 && /^\d+$/.test(trimmed)
          ? `+1${trimmed}`
          : trimmed.length === 11 && trimmed.startsWith("1")
            ? `+${trimmed}`
            : trimmed;
    const e164 = normalizeDialInputToE164(withPlus);
    if (e164 && isValidE164(e164)) return e164;
  }
  const fromNormalized = normalizedPhone ? normalizeRecruitingPhoneForStorage(normalizedPhone) : null;
  if (fromNormalized?.length === 10) {
    const e164 = normalizeDialInputToE164(`+1${fromNormalized}`);
    if (e164 && isValidE164(e164)) return e164;
  }
  return null;
}

async function loadRecruitingLeadRow(supabase: SupabaseClient, leadId: string): Promise<RecruitingLeadRow | null> {
  const { data, error } = await supabase
    .from("facebook_recruiting_leads")
    .select(
      "id, full_name, phone, email, source, form_name, license_status, lead_type, raw_payload, normalized_phone, coverage_area, visits_per_week, start_date, auto_sms_sent_at, auto_sms_error, last_admin_notification_sent_at, last_admin_sms_alert_sent_at"
    )
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    console.warn(LOG, "load_failed", { lead_id: leadId, error: error.message });
    return null;
  }
  if (!data?.id) return null;
  return data as RecruitingLeadRow;
}

async function sendApplicantThankYouSms(
  supabase: SupabaseClient,
  lead: RecruitingLeadRow
): Promise<boolean> {
  const e164 = phoneToE164(lead.phone, lead.normalized_phone);
  const hasPhone = Boolean(e164);

  if (!shouldSendFacebookRecruitingIntroSms({ created: true, hasPhone, autoSmsSentAt: lead.auto_sms_sent_at })) {
    console.log(LOG, "sms_skipped", {
      lead_id: lead.id,
      reason: !hasPhone ? "missing_phone" : "already_sent",
    });
    return false;
  }

  const firstName = extractRecruitingLeadFirstName(lead.full_name);
  const body = buildFacebookRecruitingLeadIntroSmsBody(firstName);
  const fromOverride = resolveRecruitingIntroFromE164();

  console.log(LOG, "sms_attempt", { lead_id: lead.id, to_tail: e164!.slice(-4) });

  const sms = await sendSms({ to: e164!, body, fromOverride });
  const sentAt = new Date().toISOString();

  if (!sms.ok) {
    const errText = sms.error.slice(0, 2000);
    await supabase
      .from("facebook_recruiting_leads")
      .update({ auto_sms_error: errText })
      .eq("id", lead.id)
      .is("auto_sms_sent_at", null);

    console.warn(LOG, "sms_failed", { lead_id: lead.id, error: errText.slice(0, 500) });
    return false;
  }

  await supabase
    .from("facebook_recruiting_leads")
    .update({ auto_sms_sent_at: sentAt, auto_sms_error: null })
    .eq("id", lead.id)
    .is("auto_sms_sent_at", null);

  console.log(LOG, "sms_sent", { lead_id: lead.id, message_sid: sms.messageSid });
  return true;
}

async function createInAppAdminNotifications(
  supabase: SupabaseClient,
  lead: RecruitingLeadRow,
  userIds: string[],
  title: string,
  body: string,
  href: string
): Promise<number> {
  if (userIds.length === 0) return 0;

  const dedupeKey = recruitingLeadAdminNotificationDedupeKey(lead.id);
  const rows = userIds.map((userId) => ({
    user_id: userId,
    title,
    body,
    type: "new_recruiting_lead",
    href,
    dedupe_key: dedupeKey,
  }));

  const { data, error } = await supabase
    .from("admin_notifications")
    .insert(rows, { ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.warn(LOG, "admin_notification_insert_failed", { lead_id: lead.id, error: error.message });
    return 0;
  }

  const count = (data ?? []).length;
  console.log(LOG, "admin_notification_created", { lead_id: lead.id, count });
  return count;
}

async function sendAdminPushAndInAppNotifications(
  supabase: SupabaseClient,
  lead: RecruitingLeadRow
): Promise<boolean> {
  if (
    !shouldSendFacebookRecruitingAdminNotification({
      created: true,
      lastAdminNotificationSentAt: lead.last_admin_notification_sent_at,
    })
  ) {
    console.log(LOG, "admin_notification_skipped", { lead_id: lead.id, reason: "already_sent" });
    return false;
  }

  const userIds = await resolveRecruitingLeadsNotifyUserIds(supabase);
  if (userIds.length === 0) {
    console.log(LOG, "admin_notification_skipped", { lead_id: lead.id, reason: "no_recipients" });
    return false;
  }

  const title = "New PT Recruiting Lead";
  const body = buildFacebookRecruitingLeadAdminNotificationBody({
    fullName: lead.full_name,
    coverageArea: lead.coverage_area,
    visitsPerWeek: lead.visits_per_week,
    startDate: lead.start_date,
  });
  const href = recruitingLeadAdminNotificationHref(lead.id);

  await createInAppAdminNotifications(supabase, lead, userIds, title, body, href);

  if (process.env.SAINTLY_PUSH_NEW_RECRUITING_LEAD_DISABLED === "1") {
    console.log(LOG, "push_skipped", { lead_id: lead.id, reason: "SAINTLY_PUSH_NEW_RECRUITING_LEAD_DISABLED" });
  } else {
    const push = await sendFcmDataAndNotificationToUserIds(supabase, userIds, {
      title,
      body,
      data: {
        type: "new_recruiting_lead",
        lead_id: lead.id,
        open_path: href,
      },
      apnsCollapseId: `recruiting-lead-${lead.id}`,
    });

    if (!push.ok) {
      console.warn(LOG, "push_failed", { lead_id: lead.id, error: push.error });
    } else {
      console.log(LOG, "push_sent", {
        lead_id: lead.id,
        recipientUserCount: userIds.length,
        sent: push.sent,
        failureCount: push.failureCount,
      });
    }
  }

  const notifiedAt = new Date().toISOString();
  await supabase
    .from("facebook_recruiting_leads")
    .update({ last_admin_notification_sent_at: notifiedAt })
    .eq("id", lead.id)
    .is("last_admin_notification_sent_at", null);

  return true;
}

async function sendAdminRecruitingLeadSmsAlert(
  supabase: SupabaseClient,
  lead: RecruitingLeadRow
): Promise<boolean> {
  const alertSource = resolveRecruitingAdminSmsAlertSource(lead);
  if (!alertSource) {
    console.log(LOG, "admin_sms_skipped", { lead_id: lead.id, reason: "source_not_eligible" });
    return false;
  }

  try {
    return await sendRecruitingAdminSmsAlert(supabase, lead, alertSource);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(LOG, "admin_sms_unhandled", { lead_id: lead.id, error: msg.slice(0, 500) });
    return false;
  }
}

export type FacebookRecruitingLeadPostCreateResult = {
  smsSent: boolean;
  adminNotificationSent: boolean;
  adminSmsAlertSent: boolean;
};

/**
 * Applicant thank-you SMS + staff in-app notification + FCM push for brand-new recruiting leads only.
 * Safe to skip when `created` is false (duplicate update).
 */
export async function handleNewFacebookRecruitingLeadCreated(
  supabase: SupabaseClient,
  leadId: string
): Promise<FacebookRecruitingLeadPostCreateResult> {
  const id = leadId.trim();
  if (!id) {
    return { smsSent: false, adminNotificationSent: false, adminSmsAlertSent: false };
  }

  console.log(LOG, "start", { lead_id: id });

  const lead = await loadRecruitingLeadRow(supabase, id);
  if (!lead) {
    console.warn(LOG, "skipped", { lead_id: id, reason: "lead_not_found" });
    return { smsSent: false, adminNotificationSent: false, adminSmsAlertSent: false };
  }

  const [smsSent, adminNotificationSent, adminSmsAlertSent] = await Promise.all([
    sendApplicantThankYouSms(supabase, lead),
    sendAdminPushAndInAppNotifications(supabase, lead),
    sendAdminRecruitingLeadSmsAlert(supabase, lead),
  ]);

  console.log(LOG, "complete", { lead_id: id, smsSent, adminNotificationSent, adminSmsAlertSent });
  return { smsSent, adminNotificationSent, adminSmsAlertSent };
}
