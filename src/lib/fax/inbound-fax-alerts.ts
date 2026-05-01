import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatFaxDateTimeList } from "@/lib/fax/format-fax-time";
import { getOperationalAlertSmsTo } from "@/lib/ops/operational-alert-sms";
import { fcmSmsPushDeployFingerprint } from "@/lib/push/fcm-sms-push-diagnostics";
import { resolveFaxCenterPushRecipientUserIds } from "@/lib/push/resolve-fax-push-recipients";
import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import { sendSms } from "@/lib/twilio/send-sms";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

const MANUAL_TEST_FAX_ID = "manual-test";

function parseCommaSeparatedE164(raw: string | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!raw?.trim()) return out;
  for (const part of raw.split(",")) {
    const n = normalizeDialInputToE164(part.trim());
    if (!n || !isValidE164(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Explicit SMS recipients for inbound fax alerts (comma-separated E.164).
 * If unset, falls back to the same single destination chain as operational alerts (`getOperationalAlertSmsTo`).
 */
export function getInboundFaxAlertSmsRecipients(): string[] {
  const explicit = parseCommaSeparatedE164(process.env.INBOUND_FAX_ALERT_SMS_TO?.trim());
  if (explicit.length > 0) return explicit;

  const ops = getOperationalAlertSmsTo()?.trim();
  if (!ops) return [];
  const n = normalizeDialInputToE164(ops);
  return n && isValidE164(n) ? [n] : [];
}

function buildHipaaSafeFaxAlertSms(input: {
  pageCount: number | null | undefined;
  receivedAt: string | null | undefined;
  fromNumber: string | null | undefined;
}): string {
  let msg =
    "Saintly fax: New inbound fax received. Open Fax Center to review.";
  const bits: string[] = [];
  if (input.pageCount != null && Number.isFinite(input.pageCount) && input.pageCount > 0) {
    bits.push(`${input.pageCount} page${input.pageCount === 1 ? "" : "s"}`);
  }
  const timeFmt = input.receivedAt ? formatFaxDateTimeList(input.receivedAt) : "";
  if (timeFmt && timeFmt !== "—") bits.push(`Received ${timeFmt}`);
  const from = (input.fromNumber ?? "").trim();
  if (from) {
    const disp = formatPhoneNumber(from) || from;
    bits.push(`From ${disp}`);
  }
  if (bits.length > 0) msg += ` ${bits.join(" · ")}.`;
  return msg.slice(0, 1520);
}

/**
 * After `fax_messages` row exists and Fax Center pipeline succeeded: optional push + SMS (best-effort).
 * Deduped with `fax_messages.inbound_alert_sent_at` so webhook retries do not duplicate alerts.
 */
export async function dispatchInboundFaxAlertsIfNeeded(
  supabase: SupabaseClient,
  input: {
    faxMessageId: string;
    telnyxFaxId: string | null | undefined;
    fromNumber: string | null | undefined;
    pageCount: number | null | undefined;
    receivedAt: string | null | undefined;
    /** When false, skip entirely (e.g. failed inbound). */
    shouldAlert: boolean;
  }
): Promise<void> {
  if (!input.shouldAlert) return;

  const fid = input.faxMessageId.trim();
  if (!fid) return;

  const telnyxId = (input.telnyxFaxId ?? "").trim();
  if (!telnyxId || telnyxId === MANUAL_TEST_FAX_ID) return;

  const now = new Date().toISOString();

  const { data: claimed, error: claimErr } = await supabase
    .from("fax_messages")
    .update({ inbound_alert_sent_at: now })
    .eq("id", fid)
    .is("inbound_alert_sent_at", null)
    .select("id")
    .maybeSingle();

  if (claimErr) {
    console.warn("[fax-alert] claim inbound_alert_sent_at failed:", claimErr.message);
    return;
  }
  if (!claimed?.id) {
    console.log("[fax-alert] skip duplicate (already alerted)", { faxMessageId: fid });
    return;
  }

  let smsAttempted = 0;
  let smsOk = 0;
  const smsRecipients = getInboundFaxAlertSmsRecipients();
  const smsBody = buildHipaaSafeFaxAlertSms({
    pageCount: input.pageCount,
    receivedAt: input.receivedAt,
    fromNumber: input.fromNumber,
  });

  for (const to of smsRecipients) {
    smsAttempted += 1;
    const r = await sendSms({ to, body: smsBody });
    if (r.ok) smsOk += 1;
    else console.warn("[fax-alert] SMS send failed", { error: r.error });
  }

  if (smsRecipients.length === 0) {
    console.log("[fax-alert] SMS skipped (INBOUND_FAX_ALERT_SMS_TO unset and no operational alert destination)");
  }

  let pushSent = 0;
  if (process.env.SAINTLY_PUSH_INBOUND_FAX_DISABLED === "1") {
    console.log("[fax-alert] push skipped", { reason: "SAINTLY_PUSH_INBOUND_FAX_DISABLED" });
  } else {
    const userIds = await resolveFaxCenterPushRecipientUserIds(supabase);
    if (userIds.length === 0) {
      console.log("[fax-alert] push skipped", { reason: "no_fax_center_staff_users" });
    } else {
      const collapse = telnyxId ? `fax-${telnyxId}` : `fax-${fid}`;
      const result = await sendFcmDataAndNotificationToUserIds(supabase, userIds, {
        title: "New inbound fax",
        body: "A new fax was received. Open Fax Center to review.",
        data: {
          type: "fax_inbound",
          fax_message_id: fid,
          open_path: "/admin/fax",
        },
        apnsCollapseId: collapse.slice(0, 64),
      });
      if (!result.ok) {
        console.warn("[fax-alert] push failed", { error: result.error, deploy: fcmSmsPushDeployFingerprint() });
      } else {
        pushSent = result.sent;
      }
    }
  }

  const { error: evErr } = await supabase.from("fax_events").insert({
    fax_message_id: fid,
    event_type: "inbound_fax_alert_dispatched",
    payload: {
      telnyx_fax_id: telnyxId,
      sms_recipients: smsRecipients.length,
      sms_attempted: smsAttempted,
      sms_success: smsOk,
      push_sent: pushSent,
    },
  });
  if (evErr) {
    console.warn("[fax-alert] fax_events audit insert failed:", evErr.message);
  }
}
