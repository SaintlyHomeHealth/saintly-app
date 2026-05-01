/**
 * Shared staff notifications after a CRM lead row exists (push + optional operational SMS).
 * Keeps manual intake, Facebook, phone, email, and other sources on one path.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendCrmLeadAlertSms } from "@/lib/ops/crm-lead-alert-sms";
import { notifyNewLeadCreatedPush } from "@/lib/push/notify-new-lead";

const LOG = "[lead-intake]";

export type LeadIntakeNotifyChannel =
  | "manual_crm"
  | "facebook"
  | "facebook_ads"
  | "phone_workspace"
  | "voice_intake"
  | "employment_web"
  | "email_inquiry"
  | "email_referral"
  | "other";

function asMetaRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

/**
 * After insert: operational SMS + in-app/push to staff.
 *
 * **Await** this from route handlers and server actions. Fire-and-forget patterns often lose work on
 * serverless right after the HTTP response is sent.
 *
 * Idempotent: sets `staff_intake_notified_at` on `leads.external_source_metadata` (merged shallow)
 * so accidental duplicate calls skip a second send.
 */
export async function handleNewLeadCreated(
  supabase: SupabaseClient,
  input: {
    leadId: string;
    contactId: string;
    intakeChannel: LeadIntakeNotifyChannel | string;
    /** Default true. Set false only when the caller sends operational SMS separately (legacy — avoid duplicates). */
    sendOperationalSms?: boolean;
  }
): Promise<void> {
  const leadId = input.leadId.trim();
  const contactId = input.contactId.trim();
  const channel = String(input.intakeChannel || "unknown").trim() || "unknown";
  const sendOps = input.sendOperationalSms !== false;

  if (!leadId || !contactId) {
    console.warn(LOG, "staff_notify_skipped", { reason: "missing_ids", channel });
    return;
  }

  const { data: leadRow, error: loadErr } = await supabase
    .from("leads")
    .select("id, external_source_metadata")
    .eq("id", leadId)
    .maybeSingle();

  if (loadErr) {
    console.warn(LOG, "staff_notify_skipped", { reason: "load_failed", channel, error: loadErr.message });
    return;
  }
  if (!leadRow?.id) {
    console.warn(LOG, "staff_notify_skipped", { reason: "lead_not_found", lead_id: leadId, channel });
    return;
  }

  const meta = asMetaRecord(leadRow.external_source_metadata);
  if (meta.staff_intake_notified_at) {
    console.log(LOG, "staff_notify_skip_duplicate", { lead_id: leadId, channel });
    return;
  }

  console.log(LOG, "staff_notify_start", {
    lead_id: leadId,
    contact_id_prefix: contactId.slice(0, 8),
    channel,
    crm_lead_alert_sms: sendOps,
  });

  const tasks: Promise<unknown>[] = [
    notifyNewLeadCreatedPush(supabase, leadId).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(LOG, "push_exception", { lead_id: leadId, channel, error: msg.slice(0, 200) });
    }),
  ];

  if (sendOps) {
    tasks.push(
      (async () => {
        const { data: cInfo } = await supabase
          .from("contacts")
          .select("full_name, first_name, last_name")
          .eq("id", contactId)
          .maybeSingle();

        const nm =
          (cInfo?.full_name ?? "").trim() ||
          [cInfo?.first_name, cInfo?.last_name].filter(Boolean).join(" ").trim() ||
          "Contact";

        const display =
          nm.length > 42 ? `${nm.slice(0, 41).trimEnd()}…` : nm;
        const body = `Saintly ops: New CRM lead (${display}). Leads /admin/crm/leads · contact ${contactId.slice(0, 8)}…`;
        const r = await sendCrmLeadAlertSms(body);
        if (!r.ok) {
          console.warn(LOG, "crm_lead_alert_sms_failed", { lead_id: leadId, channel, error: r.error });
        } else {
          console.log(LOG, "crm_lead_alert_sms_sent", { lead_id: leadId, channel });
        }
      })()
    );
  }

  await Promise.all(tasks);

  console.log(LOG, "staff_notify_complete", { lead_id: leadId, channel });

  const nextMeta = { ...meta, staff_intake_notified_at: new Date().toISOString() };
  const { error: upErr } = await supabase.from("leads").update({ external_source_metadata: nextMeta }).eq("id", leadId);

  if (upErr) {
    console.warn(LOG, "staff_notify_metadata_mark_failed", { lead_id: leadId, error: upErr.message });
  }
}
