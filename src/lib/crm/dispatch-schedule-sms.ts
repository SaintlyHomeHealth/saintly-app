import { insertAuditLog } from "@/lib/audit-log";
import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { sendOutboundSmsForPatient } from "@/lib/crm/outbound-patient-sms";
import { formatDispatchScheduleLine } from "@/lib/crm/dispatch-visit";
import { supabaseAdmin } from "@/lib/admin";
import { sendSms } from "@/lib/twilio/send-sms";

function pickOutboundE164(raw: string | null | undefined): string | null {
  const candidates = phoneLookupCandidates(raw);
  return candidates.find((x) => x.startsWith("+")) ?? null;
}

export function buildDispatchPatientScheduleMessage(scheduleLine: string): string {
  return `Saintly Home Health: your visit is scheduled for ${scheduleLine}. We will notify you when your clinician is on the way.`;
}

export function buildDispatchClinicianScheduleMessage(patientName: string, scheduleLine: string, address: string): string {
  const addr = address.trim() || "Address on file";
  return `New Saintly visit assigned: ${patientName}, ${scheduleLine}, ${addr}.`;
}

export type DispatchSmsMarkResult = { ok: true } | { ok: false; error: string };

/**
 * Sends schedule-time patient SMS and optionally records dispatch_patient_notified_at.
 */
export async function sendDispatchPatientScheduleNotification(args: {
  visitId: string;
  patientId: string;
  scheduledFor: string | null;
  scheduledEndAt: string | null;
  timeWindowLabel: string | null;
  markNotifiedAt: boolean;
}): Promise<DispatchSmsMarkResult> {
  const scheduleLine = formatDispatchScheduleLine(
    args.scheduledFor,
    args.scheduledEndAt,
    args.timeWindowLabel
  );
  const body = buildDispatchPatientScheduleMessage(scheduleLine);
  const result = await sendOutboundSmsForPatient(args.patientId, body, "patient");
  if (!result.ok) {
    await insertAuditLog({
      action: "crm_dispatch_patient_schedule_sms_failed",
      entityType: "patient_visit",
      entityId: args.visitId,
      metadata: { patient_id: args.patientId, detail: result.error.slice(0, 500) },
    });
    return { ok: false, error: result.error };
  }
  await insertAuditLog({
    action: "crm_dispatch_patient_schedule_sms_sent",
    entityType: "patient_visit",
    entityId: args.visitId,
    metadata: { patient_id: args.patientId, body_length: body.length },
  });
  if (args.markNotifiedAt) {
    await supabaseAdmin
      .from("patient_visits")
      .update({ dispatch_patient_notified_at: new Date().toISOString() })
      .eq("id", args.visitId);
  }
  return { ok: true };
}

/**
 * Sends SMS to assigned clinician using staff_profiles.sms_notify_phone.
 */
export async function sendDispatchClinicianScheduleNotification(args: {
  visitId: string;
  assignedUserId: string;
  patientName: string;
  scheduledFor: string | null;
  scheduledEndAt: string | null;
  timeWindowLabel: string | null;
  addressSnapshot: string | null;
  markNotifiedAt: boolean;
}): Promise<DispatchSmsMarkResult> {
  const { data: sp, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("sms_notify_phone")
    .eq("user_id", args.assignedUserId)
    .maybeSingle();
  if (error || !sp) {
    return { ok: false, error: "Clinician profile not found." };
  }
  const rawPhone = typeof sp.sms_notify_phone === "string" ? sp.sms_notify_phone : "";
  const to = pickOutboundE164(rawPhone);
  if (!to) {
    return { ok: false, error: "No dispatch SMS number on file for this clinician (Staff Access)." };
  }
  const scheduleLine = formatDispatchScheduleLine(
    args.scheduledFor,
    args.scheduledEndAt,
    args.timeWindowLabel
  );
  const body = buildDispatchClinicianScheduleMessage(
    args.patientName,
    scheduleLine,
    args.addressSnapshot ?? ""
  );
  const sent = await sendSms({ to, body });
  if (!sent.ok) {
    await insertAuditLog({
      action: "crm_dispatch_clinician_schedule_sms_failed",
      entityType: "patient_visit",
      entityId: args.visitId,
      metadata: { assigned_user_id: args.assignedUserId, detail: sent.error.slice(0, 500) },
    });
    return { ok: false, error: sent.error };
  }
  await insertAuditLog({
    action: "crm_dispatch_clinician_schedule_sms_sent",
    entityType: "patient_visit",
    entityId: args.visitId,
    metadata: { assigned_user_id: args.assignedUserId, body_length: body.length, message_sid: sent.messageSid },
  });
  if (args.markNotifiedAt) {
    await supabaseAdmin
      .from("patient_visits")
      .update({ dispatch_clinician_notified_at: new Date().toISOString() })
      .eq("id", args.visitId);
  }
  return { ok: true };
}
