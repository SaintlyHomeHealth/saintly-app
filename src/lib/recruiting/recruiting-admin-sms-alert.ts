import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { recruitingLeadAdminNotificationHref } from "@/lib/recruiting/facebook-recruiting-lead-shared";
import {
  insertRecruitingLeadActivity,
  RECRUITING_LEAD_ACTIVITY_EVENT,
} from "@/lib/recruiting/recruiting-lead-activities";
import { MANUAL_RESUME_UPLOAD_SOURCE } from "@/lib/recruiting/manual-resume-upload-constants";
import { WEBSITE_RECRUITING_SOURCE } from "@/lib/recruiting/website-recruiting-lead-constants";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { sendSms } from "@/lib/twilio/send-sms";

const LOG = "[recruiting-admin-sms-alert]";

export type RecruitingAdminSmsAlertSource = "website_careers" | "facebook_recruiting";

type RecruitingLeadAlertRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  form_name: string | null;
  license_status: string | null;
  lead_type: string | null;
  raw_payload: unknown;
  last_admin_sms_alert_sent_at: string | null;
};

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function rawPayloadLatest(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const latest = (rawPayload as { latest?: unknown }).latest;
  return latest && typeof latest === "object" ? (latest as Record<string, unknown>) : null;
}

function recruitingAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

export function recruitingLeadDetailAbsoluteUrl(leadId: string): string {
  const path = recruitingLeadAdminNotificationHref(leadId);
  const base = recruitingAppBaseUrl();
  return base ? `${base}${path}` : path;
}

export function recruitingAdminSmsAlertSourceLabel(source: RecruitingAdminSmsAlertSource): string {
  return source === "website_careers" ? "Website Careers" : "Facebook Recruiting";
}

/**
 * Only website careers + Facebook recruiting ingest should trigger admin SMS alerts.
 */
export function resolveRecruitingAdminSmsAlertSource(lead: {
  source?: string | null;
  form_name?: string | null;
  raw_payload?: unknown;
}): RecruitingAdminSmsAlertSource | null {
  const source = norm(lead.source);
  const latest = rawPayloadLatest(lead.raw_payload);

  if (latest?.migrated_from === "crm_leads" || latest?.migrated_to_recruiting === true) {
    return null;
  }
  if (source === MANUAL_RESUME_UPLOAD_SOURCE || source === "legacy_crm_lead") {
    return null;
  }
  if (latest?.pipeline === "recruiting" && latest?.candidate_id) {
    return null;
  }

  if (source === WEBSITE_RECRUITING_SOURCE || latest?.channel === "website_careers_form") {
    return "website_careers";
  }

  if (
    source.includes("facebook") ||
    source.includes("lead form") ||
    source.includes("lead ads") ||
    norm(lead.form_name).includes("facebook")
  ) {
    return "facebook_recruiting";
  }

  return null;
}

function resolveRoleOrPosition(lead: RecruitingLeadAlertRow): string {
  const latest = rawPayloadLatest(lead.raw_payload);
  const fromPayload =
    typeof latest?.position === "string"
      ? latest.position.trim()
      : typeof latest?.role === "string"
        ? latest.role.trim()
        : "";
  if (fromPayload) return fromPayload.slice(0, 120);
  if (lead.license_status?.trim()) return lead.license_status.trim().slice(0, 120);
  if (lead.lead_type?.trim()) return lead.lead_type.trim().slice(0, 120);
  return "—";
}

function buildAdminSmsAlertBody(input: {
  fullName: string;
  roleOrPosition: string;
  phone: string | null;
  email: string | null;
  sourceLabel: string;
  detailUrl: string;
}): string {
  const phone = input.phone?.trim() ? formatPhoneForDisplay(input.phone) || input.phone.trim() : "—";
  const email = input.email?.trim() || "—";
  const name = input.fullName.trim() || "Applicant";
  return [
    "New Saintly recruiting lead:",
    name,
    `Role: ${input.roleOrPosition}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    `Source: ${input.sourceLabel}`,
    `Open: ${input.detailUrl}`,
  ].join("\n");
}

function resolveAdminAlertRecipientE164(): string | null {
  const raw = process.env.RECRUITING_ADMIN_ALERT_PHONE?.trim();
  if (!raw) return null;
  const e164 = normalizeDialInputToE164(raw.startsWith("+") ? raw : raw.length === 10 ? `+1${raw}` : raw);
  if (!e164 || !isValidE164(e164)) {
    console.warn(LOG, "invalid_recipient", { configured: raw.slice(0, 4) + "…" });
    return null;
  }
  return e164;
}

async function logAdminSmsActivity(
  supabase: SupabaseClient,
  input: {
    leadId: string;
    source: RecruitingAdminSmsAlertSource;
    recipient: string;
    status: "sent" | "failed";
    sentAt: string;
    body: string;
    messageSid?: string | null;
    error?: string | null;
  }
): Promise<void> {
  const activity = await insertRecruitingLeadActivity(supabase, {
    leadId: input.leadId,
    eventType: RECRUITING_LEAD_ACTIVITY_EVENT.admin_sms_alert,
    body:
      input.status === "sent"
        ? `Admin SMS alert sent to ${input.recipient}`
        : `Admin SMS alert failed to ${input.recipient}`,
    metadata: {
      status: input.status,
      recipient: input.recipient,
      sent_at: input.sentAt,
      source: input.source,
      body: input.body,
      provider_message_id: input.messageSid ?? null,
      error: input.error ?? null,
    },
    createdBy: null,
  });

  if (!activity.ok) {
    console.warn(LOG, "activity_log_failed", { lead_id: input.leadId, error: activity.error });
  }
}

/**
 * Send one-time SMS to RECRUITING_ADMIN_ALERT_PHONE for new website/Facebook recruiting leads.
 * Never throws; lead creation must not depend on this succeeding.
 */
export async function sendRecruitingAdminSmsAlert(
  supabase: SupabaseClient,
  lead: RecruitingLeadAlertRow,
  alertSource: RecruitingAdminSmsAlertSource
): Promise<boolean> {
  if (lead.last_admin_sms_alert_sent_at) {
    console.log(LOG, "skipped", { lead_id: lead.id, reason: "already_sent" });
    return false;
  }

  const recipient = resolveAdminAlertRecipientE164();
  if (!recipient) {
    console.log(LOG, "skipped", { lead_id: lead.id, reason: "RECRUITING_ADMIN_ALERT_PHONE_not_configured" });
    return false;
  }

  const sourceLabel = recruitingAdminSmsAlertSourceLabel(alertSource);
  const detailUrl = recruitingLeadDetailAbsoluteUrl(lead.id);
  const body = buildAdminSmsAlertBody({
    fullName: lead.full_name,
    roleOrPosition: resolveRoleOrPosition(lead),
    phone: lead.phone,
    email: lead.email,
    sourceLabel,
    detailUrl,
  });

  console.log(LOG, "attempt", { lead_id: lead.id, source: alertSource, to_tail: recipient.slice(-4) });

  const sms = await sendSms({ to: recipient, body });
  const sentAt = new Date().toISOString();

  if (!sms.ok) {
    const errText = sms.error.slice(0, 2000);
    await supabase
      .from("facebook_recruiting_leads")
      .update({ last_admin_sms_alert_error: errText })
      .eq("id", lead.id)
      .is("last_admin_sms_alert_sent_at", null);

    await logAdminSmsActivity(supabase, {
      leadId: lead.id,
      source: alertSource,
      recipient,
      status: "failed",
      sentAt,
      body,
      error: errText,
    });

    console.warn(LOG, "failed", { lead_id: lead.id, error: errText.slice(0, 500) });
    return false;
  }

  await supabase
    .from("facebook_recruiting_leads")
    .update({ last_admin_sms_alert_sent_at: sentAt, last_admin_sms_alert_error: null })
    .eq("id", lead.id)
    .is("last_admin_sms_alert_sent_at", null);

  await logAdminSmsActivity(supabase, {
    leadId: lead.id,
    source: alertSource,
    recipient,
    status: "sent",
    sentAt,
    body,
    messageSid: sms.messageSid,
  });

  console.log(LOG, "sent", { lead_id: lead.id, message_sid: sms.messageSid });
  return true;
}
