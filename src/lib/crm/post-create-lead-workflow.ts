/**
 * Shared staff notifications after a CRM lead row exists (push + optional operational SMS).
 * Keeps manual intake, Facebook, phone, email, and other sources on one path.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendOperationalAlertSms } from "@/lib/ops/operational-alert-sms";
import { notifyNewLeadCreatedPush } from "@/lib/push/notify-new-lead";

const LOG = "[lead-intake]";

export type LeadIntakeNotifyChannel =
  | "manual_crm"
  | "facebook"
  | "phone_workspace"
  | "voice_intake"
  | "employment_web"
  | "email_inquiry"
  | "other";

/**
 * Fire-and-forget push; operational SMS is best-effort with structured logs (no PII).
 */
export function runPostCreateLeadStaffNotifications(
  supabase: SupabaseClient,
  input: {
    leadId: string;
    contactId: string;
    intakeChannel: LeadIntakeNotifyChannel | string;
    /** Default true. Set false only when the caller sends operational SMS separately (legacy — avoid duplicates). */
    sendOperationalSms?: boolean;
  }
): void {
  const leadId = input.leadId.trim();
  const contactId = input.contactId.trim();
  const channel = String(input.intakeChannel || "unknown").trim() || "unknown";
  const sendOps = input.sendOperationalSms !== false;

  if (!leadId || !contactId) {
    console.warn(LOG, "staff_notify_skipped", { reason: "missing_ids", channel });
    return;
  }

  console.log(LOG, "staff_notify_start", {
    lead_id: leadId,
    contact_id_prefix: contactId.slice(0, 8),
    channel,
    operational_sms: sendOps,
  });

  void (async () => {
    try {
      await notifyNewLeadCreatedPush(supabase, leadId);
      console.log(LOG, "push_complete", { lead_id: leadId, channel });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(LOG, "push_exception", { lead_id: leadId, channel, error: msg.slice(0, 200) });
    }
  })();

  if (!sendOps) {
    return;
  }

  void (async () => {
    const { data: cInfo } = await supabase
      .from("contacts")
      .select("full_name, first_name, last_name")
      .eq("id", contactId)
      .maybeSingle();

    const nm =
      (cInfo?.full_name ?? "").trim() ||
      [cInfo?.first_name, cInfo?.last_name].filter(Boolean).join(" ").trim() ||
      "Contact";

    const body = `Saintly ops: New CRM lead (${nm}). Leads /admin/crm/leads · contact ${contactId.slice(0, 8)}…`;
    const r = await sendOperationalAlertSms(body);
    if (!r.ok) {
      console.warn(LOG, "operational_sms_failed", { lead_id: leadId, channel, error: r.error });
    } else {
      console.log(LOG, "operational_sms_sent", { lead_id: leadId, channel });
    }
  })();
}
