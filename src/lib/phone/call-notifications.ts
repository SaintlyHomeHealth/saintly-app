import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type PrioritySmsReasonCode,
  formatPrioritySmsBody,
  isValidCallerIdForPriority,
  resolveMissedPathPriorityReason,
} from "@/lib/phone/priority-sms-rules";
import { sendOperationalAlertSms } from "@/lib/ops/operational-alert-sms";
import { sendSms } from "@/lib/twilio/send-sms";

export type PhoneCallNotificationType = "missed_call" | "voicemail";

const DUPLICATE_KEY = "23505";

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === DUPLICATE_KEY) return true;
  return /duplicate key|unique constraint/i.test(error.message || "");
}

const SMS_ERROR_MAX = 2000;

function truncateSmsError(message: string): string {
  if (message.length <= SMS_ERROR_MAX) return message;
  return `${message.slice(0, SMS_ERROR_MAX - 1)}…`;
}

async function persistSmsAttempt(
  supabase: SupabaseClient,
  notificationId: string,
  lastSmsError: string | null
) {
  const { error } = await supabase
    .from("phone_call_notifications")
    .update({
      last_sms_attempt_at: new Date().toISOString(),
      last_sms_error: lastSmsError,
    })
    .eq("id", notificationId);

  if (error) {
    console.warn("[phone_call_notifications] persistSmsAttempt:", error.message);
  }
}

async function sendPrioritySmsAndRecord(
  supabase: SupabaseClient,
  phoneCallId: string,
  notificationId: string,
  fromE164: string | null | undefined,
  reason: PrioritySmsReasonCode
): Promise<void> {
  const alertTo = process.env.TWILIO_ALERT_TO?.trim();
  const text = formatPrioritySmsBody(fromE164, reason);

  if (!alertTo) {
    await persistSmsAttempt(supabase, notificationId, "SMS alert skipped: TWILIO_ALERT_TO not set");
    return;
  }

  console.log("[phone_call_notifications] priority SMS", { phoneCallId, reason });
  const result = await sendSms({ to: alertTo, body: text });
  if (!result.ok) {
    console.error("[phone_call_notifications] priority SMS:", result.error);
    await persistSmsAttempt(supabase, notificationId, truncateSmsError(result.error));
    return;
  }

  const sentAt = new Date().toISOString();
  const { data: updated, error: upErr } = await supabase
    .from("phone_calls")
    .update({
      priority_sms_sent_at: sentAt,
      priority_sms_reason: reason,
    })
    .eq("id", phoneCallId)
    .is("priority_sms_sent_at", null)
    .select("id")
    .maybeSingle();

  if (upErr) {
    console.warn("[phone_call_notifications] markPhoneCallPrioritySmsSent:", upErr.message);
  } else if (!updated?.id) {
    console.warn("[phone_call_notifications] priority SMS sent but phone_calls row was already marked (race)");
  }

  await persistSmsAttempt(supabase, notificationId, null);
}

/**
 * Sends at most one Phase-1 priority SMS per call (conditional update on phone_calls after successful send).
 */
async function maybeSendPrioritySms(
  supabase: SupabaseClient,
  phoneCallId: string,
  notificationId: string,
  fromE164: string | null | undefined,
  reason: PrioritySmsReasonCode
): Promise<void> {
  if (!isValidCallerIdForPriority(fromE164)) {
    await persistSmsAttempt(
      supabase,
      notificationId,
      "SMS skipped: caller ID blocked or missing (priority rules)"
    );
    return;
  }

  const { data: existing, error: selErr } = await supabase
    .from("phone_calls")
    .select("priority_sms_sent_at")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (selErr) {
    console.warn("[phone_call_notifications] maybeSendPrioritySms read:", selErr.message);
  }
  if (existing?.priority_sms_sent_at) {
    await persistSmsAttempt(supabase, notificationId, "SMS skipped: priority alert already sent for this call");
    return;
  }

  await sendPrioritySmsAndRecord(supabase, phoneCallId, notificationId, fromE164, reason);
}

export type MissedCallNotificationContext = {
  fromE164?: string | null;
  /** Terminal status from Twilio pipeline (e.g. missed, failed, cancelled). */
  terminalStatus?: string | null;
  effectiveDurationSeconds?: number | null;
};

export type VoicemailNotificationContext = {
  fromE164?: string | null;
  durationSeconds?: number | null;
};

/**
 * Insert a missed-call follow-up (idempotent per call + type).
 * Phase-1 SMS only for repeat caller (15m) or missed + duration &gt; 12s (with valid caller ID).
 */
export async function tryInsertMissedCallNotification(
  supabase: SupabaseClient,
  phoneCallId: string,
  context?: MissedCallNotificationContext
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = phoneCallId.trim();
  if (!id) {
    return { ok: false, error: "phoneCallId is required" };
  }

  const { data: inserted, error } = await supabase
    .from("phone_call_notifications")
    .insert({
      phone_call_id: id,
      type: "missed_call",
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }

  if (!inserted?.id) {
    return { ok: false, error: "notification insert returned no id" };
  }

  const notificationId = inserted.id as string;
  const terminalStatus = (context?.terminalStatus ?? "").trim() || "unknown";

  const fromLabel = (context?.fromE164 ?? "").trim() || "unknown caller";
  void sendOperationalAlertSms(
    `Saintly ops: Missed inbound call from ${fromLabel}. Open /admin/phone`
  );

  const reason = await resolveMissedPathPriorityReason(supabase, {
    terminalStatus,
    fromE164: context?.fromE164,
    effectiveDurationSeconds: context?.effectiveDurationSeconds,
  });

  if (reason) {
    await maybeSendPrioritySms(supabase, id, notificationId, context?.fromE164, reason);
  } else {
    await persistSmsAttempt(
      supabase,
      notificationId,
      "SMS skipped: priority rules not met (missed path)"
    );
  }

  return { ok: true };
}

/**
 * Insert a voicemail follow-up (idempotent per call + type).
 * Suppresses redundant missed-call alerts for the same call once voicemail exists.
 * Phase-1 SMS for voicemail when caller ID is valid and no priority SMS was sent yet.
 */
export async function tryInsertVoicemailNotification(
  supabase: SupabaseClient,
  phoneCallId: string,
  context?: VoicemailNotificationContext
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = phoneCallId.trim();
  if (!id) {
    return { ok: false, error: "phoneCallId is required" };
  }

  const { data: inserted, error } = await supabase
    .from("phone_call_notifications")
    .insert({
      phone_call_id: id,
      type: "voicemail",
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }

  if (!inserted?.id) {
    return { ok: false, error: "notification insert returned no id" };
  }

  const notificationId = inserted.id as string;

  const { error: resolveErr } = await supabase
    .from("phone_call_notifications")
    .update({ status: "resolved" })
    .eq("phone_call_id", id)
    .eq("type", "missed_call")
    .eq("status", "new");

  if (resolveErr) {
    console.warn("[phone_call_notifications] auto-resolve missed_call:", resolveErr.message);
  }

  await maybeSendPrioritySms(supabase, id, notificationId, context?.fromE164, "voicemail_left");

  return { ok: true };
}
