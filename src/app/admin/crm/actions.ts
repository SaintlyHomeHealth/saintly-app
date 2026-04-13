"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { insertAuditLog, insertAuditLogTrusted } from "@/lib/audit-log";
import { contactFieldsFromLeadContactJoin, notifyZapierLeadStatus } from "@/lib/integrations/zapier-lead-status-webhook";
import { diffNumber, diffString, truncateChanges, type FieldChange } from "@/lib/crm/patient-profile-diff";
import { notifyOperationalVisitStatus } from "@/lib/ops/visit-operational-alert";
import { NURSE_ON_THE_WAY_MESSAGE, nurseLabelFromStaffEmail } from "@/lib/crm/patient-sms";
import { sendOutboundSmsForContact, sendOutboundSmsForPatient } from "@/lib/crm/outbound-patient-sms";
import { supabaseAdmin } from "@/lib/admin";
import { VISIT_STATUS_TRANSITIONS } from "@/lib/crm/patient-visit-status";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { sendSms } from "@/lib/twilio/send-sms";
import {
  ATTEMPT_ACTION_KEYS,
  deriveContactTypeFromActions,
  formatContactAttemptLogBlock,
} from "@/lib/crm/lead-contact-log";
import { formatLeadContactOutcomeLabel, isValidLeadContactOutcome } from "@/lib/crm/lead-contact-outcome";
import {
  formatLeadNextActionLabel,
  normalizeLeadNextActionInput,
} from "@/lib/crm/lead-follow-up-options";
import { formatLeadPipelineStatusLabel, isValidLeadPipelineStatus } from "@/lib/crm/lead-pipeline-status";
import {
  normalizeAttemptActionKeys,
  normalizeContactOutcomeResult,
} from "@/lib/crm/lead-contact-outcome-normalize";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import {
  isValidLeadTemperature,
  leadTemperatureLabel,
  normalizeLeadTemperature,
} from "@/lib/crm/lead-temperature";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import {
  isAllowedLeadInsuranceMime,
  LEAD_INSURANCE_BUCKET,
  LEAD_INSURANCE_MAX_BYTES,
  sanitizeLeadInsuranceFileName,
} from "@/lib/crm/lead-insurance-storage";
import { isValidLeadSource } from "@/lib/crm/lead-source-options";
import {
  hasAnyIntakeRequestDetail,
  parseLeadIntakeRequestFromMetadata,
  type LeadIntakeRequestDetails,
} from "@/lib/crm/lead-intake-request";
import { isValidServiceDisciplineCode, parseServiceDisciplinesFromFormData } from "@/lib/crm/service-disciplines";
import { formatFollowUpDate } from "@/lib/crm/crm-leads-table-helpers";
import { convertLeadToPatient } from "@/app/admin/phone/actions";
import { getCrmCalendarDateIsoFromInstant, getCrmCalendarTomorrowIso } from "@/lib/crm/crm-local-date";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { findOpenDuplicatePatientVisitId } from "@/lib/crm/dispatch-duplicate-visit";
import {
  buildVisitSnapshotsFromContact,
  formatDispatchScheduleLine,
  formatHmRangeToAmPm,
} from "@/lib/crm/dispatch-visit";
import {
  buildDispatchClinicianScheduleMessage,
  buildDispatchPatientScheduleMessage,
  sendDispatchClinicianScheduleNotification,
  sendDispatchPatientScheduleNotification,
} from "@/lib/crm/dispatch-schedule-sms";

/** Checkbox may submit `value="1"` or, if value omitted in some builds, `"on"`. `<select>` uses `""` | `"1"`. */
function readSendSmsFromFormData(formData: FormData): boolean {
  const all = formData.getAll("sendSms");
  const primary = formData.get("sendSms");
  const joined = all.map((v) => (typeof v === "string" ? v : String(v))).join(",");
  const s = typeof primary === "string" ? primary.trim() : "";
  const ok =
    s === "1" ||
    s === "on" ||
    s === "true" ||
    all.some((v) => v === "1" || v === "on");
  console.warn("[admin/crm] readSendSmsFromFormData", { primary, all: joined, ok });
  return ok;
}

type AssignmentRole = "primary_nurse" | "backup_nurse" | "intake" | "admin" | "clinician";

function parseAssignmentRole(raw: FormDataEntryValue | null): AssignmentRole {
  if (typeof raw !== "string") return "primary_nurse";
  const s = raw.trim();
  if (s === "primary_nurse") return "primary_nurse";
  if (s === "backup_nurse") return "backup_nurse";
  if (s === "intake") return "intake";
  if (s === "admin") return "admin";
  if (s === "clinician") return "clinician";
  return "primary_nurse";
}

function readPrimaryClinicianFlag(formData: FormData): boolean {
  const v = formData.get("isPrimaryClinician");
  return v === "1" || v === "on" || v === "true";
}

async function revalidatePatientAssignmentPaths(patientId: string) {
  revalidatePath("/admin/crm/patients");
  revalidatePath(`/admin/crm/patients/${patientId}`);
  revalidatePath("/admin/crm/roster");
  revalidatePath("/workspace/phone/patients");
  revalidatePath("/workspace/phone");
}

function revalidateDispatchAndPatientVisits(patientId: string) {
  revalidatePath("/admin/crm/dispatch");
  revalidatePath(`/admin/crm/patients/${patientId}/visits`);
  revalidatePath(`/admin/crm/patients/${patientId}`);
  revalidatePath("/admin/crm/patients");
  revalidatePath(`/workspace/phone/patients/${patientId}`);
  revalidatePath("/workspace/phone/patients");
  revalidatePath("/workspace/phone/today");
}

function readNotifyCheckbox(formData: FormData, name: string): boolean {
  const v = formData.get(name);
  return v === "1" || v === "on" || v === "true";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export async function assignPatientToStaff(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const pidRaw = formData.get("patientId");
  const uidRaw = formData.get("assignedUserId");
  const patientId = typeof pidRaw === "string" ? pidRaw.trim() : "";
  const assignedUserId = typeof uidRaw === "string" ? uidRaw.trim() : "";
  const role = parseAssignmentRole(formData.get("role"));

  if (!patientId || !assignedUserId) {
    return;
  }

  const { data: patientRow, error: pErr } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .maybeSingle();

  if (pErr || !patientRow?.id) {
    console.warn("[admin/crm] assignPatientToStaff patient:", pErr?.message);
    return;
  }

  const { data: assignee, error: sErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id")
    .eq("user_id", assignedUserId)
    .maybeSingle();

  if (sErr || !assignee?.user_id) {
    console.warn("[admin/crm] assignPatientToStaff assignee not staff:", sErr?.message);
    return;
  }

  if (role === "clinician") {
    const discRaw = formData.get("discipline");
    const discipline = typeof discRaw === "string" ? discRaw.trim() : "";
    if (!discipline || !isValidServiceDisciplineCode(discipline)) {
      console.warn("[admin/crm] assignPatientToStaff clinician: invalid discipline");
      return;
    }

    const { data: existingDup, error: dupErr } = await supabaseAdmin
      .from("patient_assignments")
      .select("id")
      .eq("patient_id", patientId)
      .eq("assigned_user_id", assignedUserId)
      .eq("role", "clinician")
      .eq("discipline", discipline)
      .eq("is_active", true)
      .maybeSingle();

    if (dupErr) {
      console.warn("[admin/crm] assignPatientToStaff clinician dup check:", dupErr.message);
      return;
    }
    if (existingDup?.id) {
      redirect(`/admin/crm/patients/${patientId}`);
    }

    const isPrimary = readPrimaryClinicianFlag(formData);
    if (isPrimary) {
      const { error: clearErr } = await supabaseAdmin
        .from("patient_assignments")
        .update({ is_primary: false })
        .eq("patient_id", patientId)
        .eq("role", "clinician")
        .eq("discipline", discipline)
        .eq("is_active", true);
      if (clearErr) {
        console.warn("[admin/crm] assignPatientToStaff clinician clear primary:", clearErr.message);
        return;
      }
    }

    const { error: insErr } = await supabaseAdmin.from("patient_assignments").insert({
      patient_id: patientId,
      assigned_user_id: assignedUserId,
      role: "clinician",
      discipline,
      is_primary: isPrimary,
      is_active: true,
    });

    if (insErr) {
      console.warn("[admin/crm] assignPatientToStaff clinician insert:", insErr.message);
      return;
    }

    await revalidatePatientAssignmentPaths(patientId);
    redirect(`/admin/crm/patients/${patientId}`);
  }

  const { data: existingDup, error: dupErr } = await supabaseAdmin
    .from("patient_assignments")
    .select("id")
    .eq("patient_id", patientId)
    .eq("assigned_user_id", assignedUserId)
    .eq("role", role)
    .eq("is_active", true)
    .maybeSingle();

  if (dupErr) {
    console.warn("[admin/crm] assignPatientToStaff dup check:", dupErr.message);
    return;
  }
  if (existingDup?.id) {
    redirect(`/admin/crm/patients/${patientId}`);
  }

  const { error: deactErr } = await supabaseAdmin
    .from("patient_assignments")
    .update({ is_active: false })
    .eq("patient_id", patientId)
    .eq("role", role)
    .eq("is_active", true);

  if (deactErr) {
    console.warn("[admin/crm] assignPatientToStaff deactivate:", deactErr.message);
    return;
  }

  const { error: insErr } = await supabaseAdmin.from("patient_assignments").insert({
    patient_id: patientId,
    assigned_user_id: assignedUserId,
    role,
    is_active: true,
  });

  if (insErr) {
    console.warn("[admin/crm] assignPatientToStaff insert:", insErr.message);
    return;
  }

  await revalidatePatientAssignmentPaths(patientId);
  redirect(`/admin/crm/patients/${patientId}`);
}

export async function setPatientPrimaryNurse(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const pidRaw = formData.get("patientId");
  const patientId = typeof pidRaw === "string" ? pidRaw.trim() : "";
  const uidRaw = formData.get("assignedUserId");
  const assignedUserId = typeof uidRaw === "string" ? uidRaw.trim() : "";
  if (!patientId) {
    return;
  }

  if (!assignedUserId) {
    const { error } = await supabaseAdmin
      .from("patient_assignments")
      .update({ is_active: false })
      .eq("patient_id", patientId)
      .eq("role", "primary_nurse")
      .eq("is_active", true);

    if (error) {
      console.warn("[admin/crm] setPatientPrimaryNurse clear:", error.message);
      return;
    }
    await revalidatePatientAssignmentPaths(patientId);
    redirect(`/admin/crm/patients/${patientId}`);
  }

  const fd = new FormData();
  fd.set("patientId", patientId);
  fd.set("assignedUserId", assignedUserId);
  fd.set("role", "primary_nurse");
  await assignPatientToStaff(fd);
}

export async function deactivatePatientAssignment(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const idRaw = formData.get("assignmentId");
  const assignmentId = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!assignmentId) {
    return;
  }

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("patient_assignments")
    .select("patient_id")
    .eq("id", assignmentId)
    .maybeSingle();

  if (loadErr || !row?.patient_id) {
    console.warn("[admin/crm] deactivatePatientAssignment load:", loadErr?.message);
    return;
  }

  const patientId = String(row.patient_id);

  const { error } = await supabaseAdmin
    .from("patient_assignments")
    .update({ is_active: false })
    .eq("id", assignmentId);

  if (error) {
    console.warn("[admin/crm] deactivatePatientAssignment:", error.message);
    return;
  }

  await revalidatePatientAssignmentPaths(patientId);
  redirect(`/admin/crm/patients/${patientId}`);
}

export type SendPatientSmsResult = { ok: true } | { ok: false; error: string };

export async function sendPatientSms(patientId: string, message: string): Promise<SendPatientSmsResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "Not allowed." };
  }

  const pid = patientId.trim();
  const body = message.trim();
  if (!pid) {
    return { ok: false, error: "Missing patient." };
  }
  if (!body) {
    return { ok: false, error: "Message is required." };
  }

  const { data: patientRow, error: pErr } = await supabaseAdmin
    .from("patients")
    .select("id, contact_id")
    .eq("id", pid)
    .maybeSingle();

  if (pErr || !patientRow?.contact_id) {
    console.warn("[admin/crm] sendPatientSms patient missing:", pErr?.message ?? "no row", { pid });
    return { ok: false, error: "Patient not found." };
  }

  const contactId = patientRow.contact_id as string;
  console.warn("[admin/crm] sendPatientSms patient ok", { pid, contactId });

  const result = await sendOutboundSmsForPatient(pid, body, "patient");

  if (result.ok) {
    console.warn("[admin/crm] sendPatientSms Twilio ok");
    await insertAuditLog({
      action: "crm_patient_sms_sent",
      entityType: "patient",
      entityId: pid,
      metadata: {
        contact_id: contactId,
        body_length: body.length,
      },
    });
    revalidatePath("/admin/crm/patients");
    return { ok: true };
  }

  const reason =
    result.error.includes("primary") || result.error.includes("Patient not found")
      ? "no_valid_primary_phone"
      : "twilio_error";
  await insertAuditLog({
    action: "crm_patient_sms_failed",
    entityType: "patient",
    entityId: pid,
    metadata: {
      contact_id: contactId,
      body_length: body.length,
      reason,
      detail: result.error.slice(0, 500),
    },
  });
  console.warn("[admin/crm] sendPatientSms Twilio error", result.error.slice(0, 400));
  return {
    ok: false,
    error:
      reason === "no_valid_primary_phone"
        ? "No valid primary phone on file."
        : "SMS could not be sent. Try again or check Twilio logs.",
  };
}

export async function sendNurseOnTheWaySms(patientId: string): Promise<SendPatientSmsResult> {
  const pid = patientId.trim();
  if (!pid) {
    console.warn("[admin/crm] sendNurseOnTheWaySms missing patient id");
    return { ok: false, error: "Missing patient." };
  }

  console.warn("[admin/crm] sendNurseOnTheWaySms start", { pid });

  const { data: patientCheck, error: pcErr } = await supabaseAdmin
    .from("patients")
    .select("id, contact_id")
    .eq("id", pid)
    .maybeSingle();

  if (pcErr || !patientCheck?.id || !patientCheck.contact_id) {
    console.warn("[admin/crm] sendNurseOnTheWaySms patient lookup failed", pcErr?.message ?? "no row", { pid });
    return { ok: false, error: "Patient not found." };
  }

  console.warn("[admin/crm] sendNurseOnTheWaySms patient ok", { pid, contact_id: patientCheck.contact_id });

  let message = NURSE_ON_THE_WAY_MESSAGE;

  const { data: asn, error: asnErr } = await supabaseAdmin
    .from("patient_assignments")
    .select("assigned_user_id")
    .eq("patient_id", pid)
    .eq("role", "primary_nurse")
    .eq("is_active", true)
    .maybeSingle();

  if (!asnErr && asn?.assigned_user_id) {
    const { data: sp } = await supabaseAdmin
      .from("staff_profiles")
      .select("email")
      .eq("user_id", asn.assigned_user_id)
      .maybeSingle();
    const label = nurseLabelFromStaffEmail(sp?.email as string | null | undefined);
    if (label) {
      message = `Hi from Saintly Home Health — ${label} is on the way. Reply if you need anything.`;
    }
  }

  const out = await sendPatientSms(pid, message);
  if (!out.ok) {
    console.warn("[admin/crm] sendNurseOnTheWaySms sendPatientSms failed", out.error);
  } else {
    console.warn("[admin/crm] sendNurseOnTheWaySms sendPatientSms ok");
  }
  return out;
}

export async function createPatientVisit(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const patientIdRaw = formData.get("patientId");
  const patientId = typeof patientIdRaw === "string" ? patientIdRaw.trim() : "";
  const scheduledRaw = formData.get("scheduledFor");
  const uidRaw = formData.get("assignedUserId");
  const scheduledFor =
    typeof scheduledRaw === "string" && scheduledRaw.trim() !== ""
      ? new Date(scheduledRaw.trim()).toISOString()
      : null;
  const assignedUserId =
    typeof uidRaw === "string" && uidRaw.trim() !== "" ? uidRaw.trim() : null;

  if (!patientId) {
    return;
  }

  const { data: patientRow, error: pErr } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .maybeSingle();

  if (pErr || !patientRow?.id) {
    console.warn("[admin/crm] createPatientVisit patient:", pErr?.message);
    return;
  }

  if (assignedUserId) {
    const { data: assignee, error: sErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id")
      .eq("user_id", assignedUserId)
      .maybeSingle();
    if (sErr || !assignee?.user_id) {
      console.warn("[admin/crm] createPatientVisit assignee:", sErr?.message);
      return;
    }
  }

  if (scheduledFor) {
    const dup = await findOpenDuplicatePatientVisitId({
      patientId,
      scheduledForIso: scheduledFor,
      scheduledEndAtIso: null,
      assignedUserId,
    });
    if (dup) {
      redirect(`/admin/crm/patients/${patientId}/visits?visitDup=1`);
    }
  }

  const { error: insErr } = await supabaseAdmin.from("patient_visits").insert({
    patient_id: patientId,
    assigned_user_id: assignedUserId,
    scheduled_for: scheduledFor,
    status: "scheduled",
    created_from: "patient_visits_page",
  });

  if (insErr) {
    console.warn("[admin/crm] createPatientVisit insert:", insErr.message);
    return;
  }

  revalidateDispatchAndPatientVisits(patientId);
}

export async function setPatientVisitStatus(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const visitIdRaw = formData.get("visitId");
  const nextRaw = formData.get("nextStatus");
  const visitId = typeof visitIdRaw === "string" ? visitIdRaw.trim() : "";
  const nextStatus = typeof nextRaw === "string" ? nextRaw.trim() : "";
  const sendSmsOnEnRoute = nextStatus === "en_route" ? readSendSmsFromFormData(formData) : false;

  if (!visitId || !nextStatus) {
    return;
  }

  console.warn("[admin/crm] setPatientVisitStatus", { visitId, nextStatus, sendSmsOnEnRoute });

  const { data: row, error: rErr } = await supabaseAdmin
    .from("patient_visits")
    .select("id, patient_id, status")
    .eq("id", visitId)
    .maybeSingle();

  if (rErr || !row?.patient_id) {
    console.warn("[admin/crm] setPatientVisitStatus load:", rErr?.message);
    return;
  }

  const current = typeof row.status === "string" ? row.status : "";
  const allowed = VISIT_STATUS_TRANSITIONS[current] ?? [];
  if (!allowed.includes(nextStatus)) {
    return;
  }

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "en_route") {
    updatePayload.en_route_at = nowIso;
  } else if (nextStatus === "arrived") {
    updatePayload.arrived_at = nowIso;
  } else if (nextStatus === "completed") {
    updatePayload.completed_at = nowIso;
  }

  const { error: uErr } = await supabaseAdmin.from("patient_visits").update(updatePayload).eq("id", visitId);

  if (uErr) {
    console.warn("[admin/crm] setPatientVisitStatus update:", uErr.message);
    return;
  }

  const patientId = row.patient_id as string;

  const returnToRaw = formData.get("returnTo");
  const returnTo = typeof returnToRaw === "string" ? returnToRaw.trim() : "";
  const redirectBase =
    returnTo === "/admin/crm/dispatch"
      ? "/admin/crm/dispatch"
      : /^\/admin\/crm\/patients\/[0-9a-f-]{36}\/visits$/.test(returnTo)
        ? returnTo
        : /^\/admin\/crm\/patients\/[0-9a-f-]{36}$/.test(returnTo)
          ? returnTo
          : `/admin/crm/patients/${patientId}/visits`;

  if (nextStatus === "arrived") {
    notifyOperationalVisitStatus(patientId, "arrived");
  }

  if (nextStatus === "en_route") {
    notifyOperationalVisitStatus(patientId, "en_route");
    revalidateDispatchAndPatientVisits(patientId);

    const q = new URLSearchParams();
    if (sendSmsOnEnRoute) {
      const smsResult = await sendNurseOnTheWaySms(patientId);
      if (smsResult.ok) {
        q.set("sms", "sent");
        console.warn("[admin/crm] setPatientVisitStatus en_route SMS sent");
      } else {
        q.set("sms", "failed");
        q.set("smsErr", smsResult.error.slice(0, 400));
        console.warn("[admin/crm] setPatientVisitStatus en_route SMS failed (visit still en_route):", smsResult.error);
      }
    } else {
      q.set("sms", "skipped");
      console.warn("[admin/crm] setPatientVisitStatus en_route SMS not requested");
    }
    redirect(`${redirectBase}?${q.toString()}`);
  }

  revalidateDispatchAndPatientVisits(patientId);

  if (returnTo === "/admin/crm/dispatch") {
    redirect("/admin/crm/dispatch");
  }
}

export async function scheduleVisitFromDispatch(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/dispatch?sched=forbidden");
  }

  const patientId = String(formData.get("patientId") ?? "").trim();
  const visitDate = String(formData.get("visitDate") ?? "").trim();
  const scheduleMode = String(formData.get("scheduleMode") ?? "exact").trim();
  const notes = String(formData.get("visitNote") ?? "").trim();
  const uidRaw = formData.get("assignedUserId");
  const assignedUserId =
    typeof uidRaw === "string" && uidRaw.trim() !== "" ? uidRaw.trim() : null;
  const notifyPatient = readNotifyCheckbox(formData, "notifyPatient");
  const notifyClinician = readNotifyCheckbox(formData, "notifyClinician");

  if (!patientId || !visitDate || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    redirect("/admin/crm/dispatch?sched=invalid");
  }

  const { data: patientRow, error: pErr } = await supabaseAdmin
    .from("patients")
    .select("id, contact_id, contacts ( primary_phone, address_line_1, address_line_2, city, state, zip, full_name, first_name, last_name )")
    .eq("id", patientId)
    .maybeSingle();

  if (pErr || !patientRow?.id) {
    redirect("/admin/crm/dispatch?sched=patient");
  }

  const cRaw = patientRow.contacts as Record<string, unknown> | Record<string, unknown>[] | null;
  const contact = (Array.isArray(cRaw) ? cRaw[0] : cRaw) as Record<string, string | null | undefined> | null;
  const snapshots = buildVisitSnapshotsFromContact(contact ?? null);

  let scheduledFor: string | null = null;
  let scheduledEndAt: string | null = null;
  let timeWindowLabel: string | null = null;

  if (scheduleMode === "window") {
    const preset = String(formData.get("windowPreset") ?? "").trim();
    let h1 = 8;
    let m1 = 0;
    let h2 = 11;
    let m2 = 0;
    if (preset === "morning") {
      h1 = 8;
      h2 = 11;
      timeWindowLabel = "8–11 AM";
    } else if (preset === "midday") {
      h1 = 11;
      h2 = 14;
      timeWindowLabel = "11 AM–2 PM";
    } else if (preset === "afternoon") {
      h1 = 14;
      h2 = 17;
      timeWindowLabel = "2–5 PM";
    } else {
      const ws = String(formData.get("windowStart") ?? "").trim();
      const we = String(formData.get("windowEnd") ?? "").trim();
      const tm = /^(\d{1,2}):(\d{2})$/;
      const ms = ws.match(tm);
      const me = we.match(tm);
      if (!ms || !me) {
        redirect("/admin/crm/dispatch?sched=window");
      }
      h1 = Number.parseInt(ms[1], 10);
      m1 = Number.parseInt(ms[2], 10);
      h2 = Number.parseInt(me[1], 10);
      m2 = Number.parseInt(me[2], 10);
      timeWindowLabel = formatHmRangeToAmPm(ws, we);
    }
    const start = new Date(`${visitDate}T${pad2(h1)}:${pad2(m1)}:00`);
    const end = new Date(`${visitDate}T${pad2(h2)}:${pad2(m2)}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      redirect("/admin/crm/dispatch?sched=window");
    }
    scheduledFor = start.toISOString();
    scheduledEndAt = end.toISOString();
  } else {
    const visitTime = String(formData.get("visitTime") ?? "").trim();
    if (!visitTime || !/^\d{1,2}:\d{2}$/.test(visitTime)) {
      redirect("/admin/crm/dispatch?sched=time");
    }
    const d = new Date(`${visitDate}T${visitTime}:00`);
    if (Number.isNaN(d.getTime())) {
      redirect("/admin/crm/dispatch?sched=time");
    }
    scheduledFor = d.toISOString();
  }

  if (assignedUserId) {
    const { data: assignee, error: sErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id")
      .eq("user_id", assignedUserId)
      .maybeSingle();
    if (sErr || !assignee?.user_id) {
      redirect("/admin/crm/dispatch?sched=assignee");
    }
  }

  const dupId = await findOpenDuplicatePatientVisitId({
    patientId,
    scheduledForIso: scheduledFor as string,
    scheduledEndAtIso: scheduledEndAt,
    assignedUserId,
  });
  if (dupId) {
    redirect("/admin/crm/dispatch?sched=dup");
  }

  const insertRow = {
    patient_id: patientId,
    assigned_user_id: assignedUserId,
    scheduled_for: scheduledFor,
    scheduled_end_at: scheduledEndAt,
    time_window_label: timeWindowLabel,
    status: "scheduled" as const,
    visit_note: notes || null,
    created_from: "admin_dispatch",
    patient_phone_snapshot: snapshots.patient_phone_snapshot,
    address_snapshot: snapshots.address_snapshot,
    notify_patient_on_schedule: notifyPatient,
    notify_clinician_on_schedule: notifyClinician,
  };

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("patient_visits")
    .insert(insertRow)
    .select("id")
    .maybeSingle();

  if (insErr || !inserted?.id) {
    console.warn("[admin/crm] scheduleVisitFromDispatch", insErr?.message);
    redirect("/admin/crm/dispatch?sched=save");
  }

  const visitId = String(inserted.id);
  const patientName =
    (contact?.full_name ?? "").trim() ||
    [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim() ||
    "Patient";

  if (notifyPatient) {
    await sendDispatchPatientScheduleNotification({
      visitId,
      patientId,
      scheduledFor,
      scheduledEndAt,
      timeWindowLabel,
      markNotifiedAt: true,
    });
  }
  if (notifyClinician && assignedUserId) {
    await sendDispatchClinicianScheduleNotification({
      visitId,
      assignedUserId,
      patientName,
      scheduledFor,
      scheduledEndAt,
      timeWindowLabel,
      addressSnapshot: snapshots.address_snapshot,
      markNotifiedAt: true,
    });
  }

  revalidateDispatchAndPatientVisits(patientId);
  redirect("/admin/crm/dispatch?sched=ok");
}

export async function reassignDispatchVisit(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/dispatch?reass=forbidden");
  }
  const visitId = String(formData.get("visitId") ?? "").trim();
  const uidRaw = formData.get("assignedUserId");
  const assignedUserId =
    typeof uidRaw === "string" && uidRaw.trim() !== "" ? uidRaw.trim() : null;
  if (!visitId) redirect("/admin/crm/dispatch?reass=invalid");

  if (assignedUserId) {
    const { data: assignee, error: sErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id")
      .eq("user_id", assignedUserId)
      .maybeSingle();
    if (sErr || !assignee?.user_id) redirect("/admin/crm/dispatch?reass=assignee");
  }

  const { data: row } = await supabaseAdmin
    .from("patient_visits")
    .select("patient_id")
    .eq("id", visitId)
    .maybeSingle();
  if (!row?.patient_id) redirect("/admin/crm/dispatch?reass=invalid");

  const { error: uErr } = await supabaseAdmin
    .from("patient_visits")
    .update({ assigned_user_id: assignedUserId })
    .eq("id", visitId);
  if (uErr) {
    console.warn("[admin/crm] reassignDispatchVisit", uErr.message);
    redirect("/admin/crm/dispatch?reass=fail");
  }
  revalidateDispatchAndPatientVisits(String(row.patient_id));
  redirect("/admin/crm/dispatch?reass=ok");
}

export async function rescheduleDispatchVisit(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/dispatch?resched=forbidden");
  }
  const visitId = String(formData.get("visitId") ?? "").trim();
  const visitDate = String(formData.get("visitDate") ?? "").trim();
  const visitTime = String(formData.get("visitTime") ?? "").trim();
  if (!visitId || !visitDate || !visitTime) redirect("/admin/crm/dispatch?resched=invalid");

  const scheduledFor = new Date(`${visitDate}T${visitTime}:00`);
  if (Number.isNaN(scheduledFor.getTime())) redirect("/admin/crm/dispatch?resched=invalid");

  const { data: row } = await supabaseAdmin
    .from("patient_visits")
    .select("patient_id, status")
    .eq("id", visitId)
    .maybeSingle();
  if (!row?.patient_id) redirect("/admin/crm/dispatch?resched=invalid");
  const st = typeof row.status === "string" ? row.status : "";
  if (st === "completed" || st === "canceled") redirect("/admin/crm/dispatch?resched=blocked");

  const { error: uErr } = await supabaseAdmin
    .from("patient_visits")
    .update({
      status: "scheduled",
      scheduled_for: scheduledFor.toISOString(),
      scheduled_end_at: null,
      time_window_label: null,
      reminder_day_before_sent_at: null,
      reminder_day_of_sent_at: null,
      en_route_at: null,
      arrived_at: null,
      completed_at: null,
    })
    .eq("id", visitId);
  if (uErr) {
    console.warn("[admin/crm] rescheduleDispatchVisit", uErr.message);
    redirect("/admin/crm/dispatch?resched=fail");
  }
  revalidateDispatchAndPatientVisits(String(row.patient_id));
  redirect("/admin/crm/dispatch?resched=ok");
}

export async function sendDispatchVisitPatientSms(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/dispatch?sms=forbidden");
  }
  const visitId = String(formData.get("visitId") ?? "").trim();
  if (!visitId) redirect("/admin/crm/dispatch?sms=invalid");

  const { data: v } = await supabaseAdmin
    .from("patient_visits")
    .select("id, patient_id, scheduled_for, scheduled_end_at, time_window_label")
    .eq("id", visitId)
    .maybeSingle();
  if (!v?.patient_id) redirect("/admin/crm/dispatch?sms=invalid");

  const line = formatDispatchScheduleLine(
    typeof v.scheduled_for === "string" ? v.scheduled_for : null,
    typeof v.scheduled_end_at === "string" ? v.scheduled_end_at : null,
    typeof v.time_window_label === "string" ? v.time_window_label : null
  );
  const body = buildDispatchPatientScheduleMessage(line);
  const out = await sendOutboundSmsForPatient(String(v.patient_id), body, "patient");
  const pid = String(v.patient_id);
  if (!out.ok) {
    await insertAuditLog({
      action: "crm_dispatch_patient_manual_sms_failed",
      entityType: "patient_visit",
      entityId: visitId,
      metadata: { patient_id: pid, detail: out.error.slice(0, 500) },
    });
    redirect(`/admin/crm/dispatch?sms=patient_fail&vid=${encodeURIComponent(visitId)}`);
  }
  await insertAuditLog({
    action: "crm_dispatch_patient_manual_sms_sent",
    entityType: "patient_visit",
    entityId: visitId,
    metadata: { patient_id: pid, body_length: body.length },
  });
  revalidateDispatchAndPatientVisits(pid);
  redirect(`/admin/crm/dispatch?sms=patient_ok`);
}

export async function sendDispatchVisitClinicianSms(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/dispatch?sms=forbidden");
  }
  const visitId = String(formData.get("visitId") ?? "").trim();
  if (!visitId) redirect("/admin/crm/dispatch?sms=invalid");

  const { data: v } = await supabaseAdmin
    .from("patient_visits")
    .select(
      "id, patient_id, assigned_user_id, scheduled_for, scheduled_end_at, time_window_label, address_snapshot, patients ( contacts ( full_name, first_name, last_name ) )"
    )
    .eq("id", visitId)
    .maybeSingle();

  if (!v?.patient_id || !v.assigned_user_id) {
    redirect("/admin/crm/dispatch?sms=no_clinician");
  }

  const pr = v.patients as { contacts?: unknown } | null;
  const cr = pr?.contacts as Record<string, unknown> | Record<string, unknown>[] | undefined;
  const c = (Array.isArray(cr) ? cr[0] : cr) as Record<string, string | null> | undefined;
  const patientName =
    (c?.full_name ?? "").trim() ||
    [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() ||
    "Patient";

  const line = formatDispatchScheduleLine(
    typeof v.scheduled_for === "string" ? v.scheduled_for : null,
    typeof v.scheduled_end_at === "string" ? v.scheduled_end_at : null,
    typeof v.time_window_label === "string" ? v.time_window_label : null
  );
  const addr = typeof v.address_snapshot === "string" ? v.address_snapshot : "";
  const body = buildDispatchClinicianScheduleMessage(patientName, line, addr);
  const uid = String(v.assigned_user_id);

  const { data: sp } = await supabaseAdmin
    .from("staff_profiles")
    .select("sms_notify_phone")
    .eq("user_id", uid)
    .maybeSingle();
  const rawPhone = typeof sp?.sms_notify_phone === "string" ? sp.sms_notify_phone : "";
  const to = phoneLookupCandidates(rawPhone).find((x) => x.startsWith("+")) ?? null;
  if (!to) {
    redirect("/admin/crm/dispatch?sms=no_phone");
  }
  const sent = await sendSms({ to, body });
  const pid = String(v.patient_id);
  if (!sent.ok) {
    await insertAuditLog({
      action: "crm_dispatch_clinician_manual_sms_failed",
      entityType: "patient_visit",
      entityId: visitId,
      metadata: { assigned_user_id: uid, detail: sent.error.slice(0, 500) },
    });
    redirect(`/admin/crm/dispatch?sms=clinician_fail`);
  }
  await insertAuditLog({
    action: "crm_dispatch_clinician_manual_sms_sent",
    entityType: "patient_visit",
    entityId: visitId,
    metadata: { assigned_user_id: uid, body_length: body.length, message_sid: sent.messageSid },
  });
  revalidateDispatchAndPatientVisits(pid);
  redirect(`/admin/crm/dispatch?sms=clinician_ok`);
}

function readOptionalIntakeText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function readIntakeRequestFromForm(formData: FormData): LeadIntakeRequestDetails {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    zip_code: get("intake_zip_code"),
    service_needed: get("intake_service_needed"),
    care_for: get("intake_care_for"),
    start_time: get("intake_start_time"),
    situation: get("intake_situation"),
  };
}

/** Digits-only for optional phone/fax fields (empty → null). */
function readOptionalNormalizedPhone(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const d = normalizePhone(v);
  return d === "" ? null : d;
}

const LEAD_OWNER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readOptionalOwnerUserId(formData: FormData): string | null {
  const v = formData.get("owner_user_id");
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (!LEAD_OWNER_UUID_RE.test(t)) return null;
  return t;
}

function readOptionalFollowUpDateIso(formData: FormData): string | null {
  const v = formData.get("follow_up_date");
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

/** `YYYY-MM-DD` for `leads.dob`, or null when cleared / invalid. */
function readOptionalDobIso(formData: FormData): string | null {
  const v = formData.get("dob");
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function readOptionalMedicareEffectiveDateIso(formData: FormData): string | null {
  const v = formData.get("medicare_effective_date");
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function readOptionalLeadTemperature(formData: FormData): string | null {
  const v = formData.get("lead_temperature");
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  if (!isValidLeadTemperature(t)) return null;
  return t;
}

async function insertLeadActivityRow(input: {
  leadId: string;
  eventType: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdByUserId: string | null;
  deletable?: boolean;
}): Promise<boolean> {
  const { error } = await supabaseAdmin.from("lead_activities").insert({
    lead_id: input.leadId,
    event_type: input.eventType,
    body: input.body,
    metadata: input.metadata ?? {},
    created_by_user_id: input.createdByUserId,
    deletable: input.deletable ?? false,
  });
  if (error) {
    console.warn("[admin/crm] insertLeadActivityRow:", error.message);
    return false;
  }
  return true;
}

function normStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function staffShortLabel(
  userId: string | null | undefined,
  map: Map<string, { email: string | null; full_name: string | null }>
): string {
  if (!userId?.trim()) return "Unassigned";
  const s = map.get(userId.trim());
  const name = (s?.full_name ?? "").trim();
  if (name) return name;
  const em = (s?.email ?? "").trim();
  if (em) return em;
  return `${userId.slice(0, 8)}…`;
}


function readLeadNextActionFromForm(formData: FormData): string | null {
  const v = formData.get("next_action");
  if (typeof v !== "string") return null;
  const n = normalizeLeadNextActionInput(v);
  if (!n.ok) return null;
  return n.value;
}

function readLeadPipelineStatusFromForm(formData: FormData): string | null {
  const v = formData.get("pipeline_status");
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (!isValidLeadPipelineStatus(t)) return null;
  return t;
}

function normDisciplinesList(v: unknown): string {
  const arr = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  return [...new Set(arr.map((x) => x.trim()))].sort().join(", ");
}

export async function updateLeadIntake(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const idRaw = formData.get("leadId");
  const leadId = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!leadId) {
    return;
  }

  const { data: beforeRow, error: beforeErr } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, status, owner_user_id, next_action, follow_up_date, referring_doctor_name, doctor_office_name, doctor_office_phone, doctor_office_fax, doctor_office_contact_person, referring_provider_name, referring_provider_phone, payer_name, payer_type, referral_source, service_disciplines, service_type, intake_status, notes, external_source_metadata, medicare_number, medicare_effective_date, medicare_notes, lead_temperature"
      )
      .eq("id", leadId)
  ).maybeSingle();

  if (beforeErr || !beforeRow?.id) {
    console.warn("[admin/crm] updateLeadIntake load:", beforeErr?.message);
    return;
  }

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, full_name");
  const staffById = new Map(
    (staffRows ?? []).map((s) => [s.user_id, { email: s.email, full_name: s.full_name }])
  );

  const intake = readIntakeRequestFromForm(formData);
  const { data: metaRow } = await supabaseAdmin
    .from("leads")
    .select("external_source_metadata")
    .eq("id", leadId)
    .maybeSingle();

  const prev = metaRow?.external_source_metadata;
  const mergedMeta: Record<string, unknown> =
    prev && typeof prev === "object" && !Array.isArray(prev) ? { ...(prev as Record<string, unknown>) } : {};
  mergedMeta.intake_request = intake;

  const disciplines = parseServiceDisciplinesFromFormData(formData);
  const pipelineStatus = readLeadPipelineStatusFromForm(formData);
  const payload = {
    ...(pipelineStatus !== null ? { status: pipelineStatus } : {}),
    owner_user_id: readOptionalOwnerUserId(formData),
    next_action: readLeadNextActionFromForm(formData),
    follow_up_date: readOptionalFollowUpDateIso(formData),
    referring_doctor_name: readOptionalIntakeText(formData, "referring_doctor_name"),
    doctor_office_name: readOptionalIntakeText(formData, "doctor_office_name"),
    doctor_office_phone: readOptionalNormalizedPhone(formData, "doctor_office_phone"),
    doctor_office_fax: readOptionalNormalizedPhone(formData, "doctor_office_fax"),
    doctor_office_contact_person: readOptionalIntakeText(formData, "doctor_office_contact_person"),
    referring_provider_name: readOptionalIntakeText(formData, "referring_provider_name"),
    referring_provider_phone: readOptionalNormalizedPhone(formData, "referring_provider_phone"),
    payer_name: readOptionalIntakeText(formData, "payer_name"),
    payer_type: readOptionalIntakeText(formData, "payer_type"),
    referral_source: readOptionalIntakeText(formData, "referral_source"),
    service_disciplines: disciplines,
    service_type: disciplines.length > 0 ? disciplines.join(", ") : null,
    intake_status: readOptionalIntakeText(formData, "intake_status"),
    external_source_metadata: mergedMeta,
    notes: readOptionalIntakeText(formData, "lead_notes"),
    medicare_number: readOptionalIntakeText(formData, "medicare_number"),
    medicare_effective_date: readOptionalMedicareEffectiveDateIso(formData),
    medicare_notes: readOptionalIntakeText(formData, "medicare_notes"),
    lead_temperature: readOptionalLeadTemperature(formData),
  };

  const B = beforeRow as Record<string, unknown>;
  const uid = staff.user_id;

  const { error } = await supabaseAdmin.from("leads").update(payload).eq("id", leadId).is("deleted_at", null);
  if (error) {
    console.warn("[admin/crm] updateLeadIntake:", error.message);
    return;
  }

  const beforeIr = parseLeadIntakeRequestFromMetadata(B.external_source_metadata);
  const irChanged =
    beforeIr.zip_code !== intake.zip_code ||
    beforeIr.service_needed !== intake.service_needed ||
    beforeIr.care_for !== intake.care_for ||
    beforeIr.start_time !== intake.start_time ||
    beforeIr.situation !== intake.situation;

  if (pipelineStatus !== null && normStr(B.status) !== normStr(pipelineStatus)) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.status_changed,
      body: `Status changed from ${formatLeadPipelineStatusLabel(normStr(B.status))} to ${formatLeadPipelineStatusLabel(
        normStr(pipelineStatus)
      )}`,
      metadata: { before: normStr(B.status), after: normStr(pipelineStatus) },
      createdByUserId: uid,
    });
  }

  const oldOwner = normStr(B.owner_user_id);
  const newOwner = readOptionalOwnerUserId(formData);
  const newOwnerNorm = newOwner == null ? null : newOwner;
  if (oldOwner !== newOwnerNorm) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.owner_changed,
      body: `Owner changed from ${staffShortLabel(oldOwner, staffById)} to ${staffShortLabel(newOwnerNorm, staffById)}`,
      metadata: { before: oldOwner, after: newOwnerNorm },
      createdByUserId: uid,
    });
  }

  const oldNext = normStr(B.next_action);
  const newNext = readLeadNextActionFromForm(formData);
  const newNextNorm = newNext == null ? null : newNext;
  if (oldNext !== newNextNorm) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.next_action_changed,
      body: `Next action changed from ${formatLeadNextActionLabel(oldNext)} to ${formatLeadNextActionLabel(newNextNorm)}`,
      metadata: { before: oldNext, after: newNextNorm },
      createdByUserId: uid,
    });
  }

  const oldFu = normStr(B.follow_up_date);
  const newFu = readOptionalFollowUpDateIso(formData);
  const newFuNorm = newFu == null ? null : newFu;
  if (oldFu !== newFuNorm) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.follow_up_changed,
      body: `Follow-up changed from ${formatFollowUpDate(oldFu)} to ${formatFollowUpDate(newFuNorm)}`,
      metadata: { before: oldFu, after: newFuNorm },
      createdByUserId: uid,
    });
  }

  const oldDisc = normDisciplinesList(B.service_disciplines);
  const newDisc = normDisciplinesList(disciplines);
  if (oldDisc !== newDisc) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.intake_field_updated,
      body: `Service disciplines updated`,
      metadata: { before: oldDisc || "—", after: newDisc || "—" },
      createdByUserId: uid,
    });
  }

  if (normStr(B.payer_name) !== normStr(payload.payer_name) || normStr(B.payer_type) !== normStr(payload.payer_type)) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.payer_updated,
      body: `Payer updated (${normStr(payload.payer_type) ?? "—"} · ${normStr(payload.payer_name) ?? "—"})`,
      metadata: {
        payer_type_before: normStr(B.payer_type),
        payer_type_after: normStr(payload.payer_type),
        payer_name_before: normStr(B.payer_name),
        payer_name_after: normStr(payload.payer_name),
      },
      createdByUserId: uid,
    });
  }

  const referralFieldNames = [
    "referring_doctor_name",
    "doctor_office_name",
    "doctor_office_phone",
    "doctor_office_fax",
    "doctor_office_contact_person",
    "referring_provider_name",
    "referring_provider_phone",
    "referral_source",
  ] as const;
  const referralChanged: string[] = [];
  for (const k of referralFieldNames) {
    if (normStr(B[k]) !== normStr(payload[k])) referralChanged.push(k);
  }
  if (referralChanged.length > 0) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.referral_updated,
      body: "Referral or doctor office details were updated",
      metadata: { fields: referralChanged },
      createdByUserId: uid,
    });
  }

  if (normStr(B.intake_status) !== normStr(payload.intake_status)) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.intake_field_updated,
      body: `Intake status changed from ${normStr(B.intake_status) ?? "—"} to ${normStr(payload.intake_status) ?? "—"}`,
      metadata: { field: "intake_status", before: normStr(B.intake_status), after: normStr(payload.intake_status) },
      createdByUserId: uid,
    });
  }

  const beforeTmp = normalizeLeadTemperature(
    typeof B.lead_temperature === "string" ? B.lead_temperature : null
  );
  const afterTmp = normalizeLeadTemperature(payload.lead_temperature);
  if (beforeTmp !== afterTmp) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.lead_temperature_updated,
      body: `Priority changed from ${leadTemperatureLabel(beforeTmp)} to ${leadTemperatureLabel(afterTmp)}`,
      metadata: { before: beforeTmp, after: afterTmp },
      createdByUserId: uid,
    });
  }

  if (irChanged) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.request_details_updated,
      body: "Request details (ZIP, service, care, timing, or situation) were updated",
      metadata: { before: beforeIr, after: intake },
      createdByUserId: uid,
    });
  }

  if (normStr(B.notes) !== normStr(payload.notes)) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.lead_notes_updated,
      body: "Lead notes (general) were updated",
      metadata: {},
      createdByUserId: uid,
    });
  }

  const medNum = normStr(B.medicare_number) !== normStr(payload.medicare_number);
  const beforeMedDt =
    typeof B.medicare_effective_date === "string"
      ? B.medicare_effective_date.slice(0, 10)
      : B.medicare_effective_date instanceof Date
        ? B.medicare_effective_date.toISOString().slice(0, 10)
        : "";
  const afterMedDt = payload.medicare_effective_date ?? "";
  const medDt = beforeMedDt !== afterMedDt;
  const medNotes = normStr(B.medicare_notes) !== normStr(payload.medicare_notes);
  if (medNum || medDt || medNotes) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.medicare_updated,
      body: "Medicare fields were updated",
      metadata: {
        number_changed: medNum,
        effective_date_changed: medDt,
        notes_changed: medNotes,
      },
      createdByUserId: uid,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");
}

export type SaveLeadOutcomeResult =
  | { ok: true }
  | {
      ok: false;
      error: "forbidden" | "invalid_lead" | "invalid_outcome" | "invalid_contact_type" | "save_failed";
      /** Human-readable detail (DB message, validation, etc.) */
      message?: string;
    };

/**
 * Persists a contact attempt on the lead (`leads.last_*` columns) and appends a structured row to `lead_activities`.
 */
function readIsoInstantFromForm(formData: FormData, key: string): Date | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function readAttemptActionsFromForm(formData: FormData): string[] {
  const raw = formData.getAll("attempt_actions");
  const allowed = new Set<string>(ATTEMPT_ACTION_KEYS);
  const out: string[] = [];
  for (const v of raw) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s && allowed.has(s)) out.push(s);
  }
  return normalizeAttemptActionKeys([...new Set(out)]);
}

export type SaveLeadOutcomeInput = {
  leadId: string;
  outcome: string;
  actionKeys: string[];
  attemptAt: Date;
  followUpAt: Date | null;
  nextAction: string | null;
  notes: string;
};

/**
 * Shared persistence for contact outcomes (used by server action + `/api/crm/contact-outcome`).
 */
export async function saveLeadOutcomeCore(input: SaveLeadOutcomeInput): Promise<SaveLeadOutcomeResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    console.warn("[admin/crm] saveLeadOutcomeCore: forbidden");
    return { ok: false, error: "forbidden", message: "You don't have permission to save this outcome." };
  }

  const leadId = input.leadId.trim();
  if (!leadId) {
    return { ok: false, error: "invalid_lead", message: "Missing lead id." };
  }

  const outcome = normalizeContactOutcomeResult(input.outcome);
  if (!outcome || !isValidLeadContactOutcome(outcome)) {
    return {
      ok: false,
      error: "invalid_outcome",
      message: "Select a valid contact result.",
    };
  }

  const actionKeys = normalizeAttemptActionKeys(input.actionKeys);
  if (actionKeys.length === 0) {
    return {
      ok: false,
      error: "invalid_outcome",
      message: "Select at least one attempted action.",
    };
  }

  const { data: leadBefore, error: leadLoadErr } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("last_outcome, contacts ( full_name, first_name, last_name, primary_phone, email )")
      .eq("id", leadId)
  ).maybeSingle();

  if (leadLoadErr) {
    console.error("[admin/crm] saveLeadOutcomeCore load:", leadLoadErr.message);
    return {
      ok: false,
      error: "invalid_lead",
      message: leadLoadErr.message || "Could not load lead.",
    };
  }
  if (!leadBefore) {
    return {
      ok: false,
      error: "invalid_lead",
      message: "Lead not found or may have been archived.",
    };
  }

  const notes = input.notes.trim().slice(0, 4000);

  let nextAction: string | null = null;
  if (input.nextAction != null && String(input.nextAction).trim() !== "") {
    const n = normalizeLeadNextActionInput(input.nextAction);
    if (!n.ok) {
      return { ok: false, error: "invalid_outcome", message: n.message };
    }
    nextAction = n.value;
  }

  const attemptAt = input.attemptAt;
  if (Number.isNaN(attemptAt.getTime())) {
    return { ok: false, error: "invalid_outcome", message: "Invalid attempt date/time." };
  }

  const followUpAt = input.followUpAt;

  const contactType = deriveContactTypeFromActions(actionKeys);

  const logBlock = formatContactAttemptLogBlock({
    attemptAt,
    resultLabel: formatLeadContactOutcomeLabel(outcome),
    actionKeys,
    nextStepLabel: nextAction ? formatLeadNextActionLabel(nextAction) : "—",
    followUpAt,
    note: notes,
  });

  const rowUpdate = {
    last_contact_at: attemptAt.toISOString(),
    last_contact_type: contactType,
    last_outcome: outcome,
    next_action: nextAction,
    follow_up_date: followUpAt ? getCrmCalendarDateIsoFromInstant(followUpAt) : null,
    follow_up_at: followUpAt ? followUpAt.toISOString() : null,
    contact_attempt_actions: actionKeys,
  };

  console.log("[admin/crm] saveLeadOutcomeCore rowUpdate", rowUpdate);

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update(rowUpdate)
    .eq("id", leadId)
    .is("deleted_at", null)
    .select("id, last_outcome, last_contact_at, next_action, follow_up_date, follow_up_at")
    .maybeSingle();

  if (error) {
    console.error("[admin/crm] saveLeadOutcomeCore DB error:", error.message, error);
    const code = typeof (error as { code?: string }).code === "string" ? (error as { code: string }).code : "";
    let message = error.message || "Database error while saving outcome.";
    if (
      code === "23514" ||
      /leads_next_action_check|violates check constraint.*next_action/i.test(message)
    ) {
      message = "Next step is not valid. Choose an option from the list.";
    }
    return {
      ok: false,
      error: "save_failed",
      message,
    };
  }

  if (!data?.id) {
    console.error("[admin/crm] saveLeadOutcomeCore: no row updated (lead missing or deleted?)");
    return {
      ok: false,
      error: "save_failed",
      message: "No row updated — lead may be missing or archived.",
    };
  }

  const activityOk = await insertLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.contact_attempt,
    body: logBlock,
    metadata: {
      outcome,
      actionKeys,
      next_action: nextAction,
      follow_up_at: followUpAt ? followUpAt.toISOString() : null,
    },
    createdByUserId: staff.user_id,
  });

  if (!activityOk) {
    console.error("[admin/crm] saveLeadOutcomeCore: activity insert failed after lead update");
  }

  if (outcome === "spoke") {
    const prev = typeof leadBefore.last_outcome === "string" ? leadBefore.last_outcome.trim() : "";
    if (prev !== "spoke") {
      const c = contactFieldsFromLeadContactJoin(leadBefore.contacts);
      notifyZapierLeadStatus({
        email: c.email,
        phone: c.phone,
        status: "spoke",
        name: c.name,
      });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");

  return { ok: true };
}

export async function saveLeadOutcome(formData: FormData): Promise<SaveLeadOutcomeResult> {
  const received: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    received[k] = typeof v === "string" ? v : String(v);
  }
  console.log("[admin/crm] saveLeadOutcome received", received);

  const idRaw = formData.get("leadId");
  const leadId = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!leadId) {
    return { ok: false, error: "invalid_lead", message: "Missing lead id." };
  }

  const outcomeRaw = formData.get("outcome");
  const outcome = typeof outcomeRaw === "string" ? outcomeRaw.trim() : "";

  const actionKeys = readAttemptActionsFromForm(formData);

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim().slice(0, 4000) : "";

  const nextAction = readLeadNextActionFromForm(formData);

  const attemptAt = readIsoInstantFromForm(formData, "attempt_at_iso") ?? new Date();
  const followUpAt = readIsoInstantFromForm(formData, "follow_up_at_iso");

  return saveLeadOutcomeCore({
    leadId,
    outcome,
    actionKeys,
    attemptAt,
    followUpAt,
    nextAction,
    notes,
  });
}

export type SaveLeadQuickNoteResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid_lead" | "empty" | "load_failed" | "save_failed" };

/** Inserts `lead_activities` manual note and bumps `last_contact_at` (legacy `last_note` is unchanged). */
export async function saveLeadQuickNote(formData: FormData): Promise<SaveLeadQuickNoteResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    console.warn("[admin/crm] saveLeadQuickNote: forbidden");
    return { ok: false, error: "forbidden" };
  }

  const idRaw = formData.get("leadId");
  const leadId = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!leadId) {
    return { ok: false, error: "invalid_lead" };
  }

  const noteRaw = formData.get("quick_note");
  const note = typeof noteRaw === "string" ? noteRaw.trim().slice(0, 4000) : "";
  if (!note) {
    return { ok: false, error: "empty" };
  }

  const { data: prevRow, error: loadErr } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("id").eq("id", leadId)
  ).maybeSingle();

  if (loadErr) {
    console.error("[admin/crm] saveLeadQuickNote load:", loadErr.message);
    return { ok: false, error: "load_failed" };
  }
  if (!prevRow) {
    return { ok: false, error: "load_failed" };
  }

  const inserted = await insertLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.manual_note,
    body: note,
    metadata: {},
    createdByUserId: staff.user_id,
    deletable: true,
  });
  if (!inserted) {
    return { ok: false, error: "save_failed" };
  }

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update({
      last_contact_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .is("deleted_at", null)
    .select("id, last_contact_at")
    .maybeSingle();

  if (error) {
    console.error("[admin/crm] saveLeadQuickNote DB error:", error.message, error);
    return { ok: false, error: "save_failed" };
  }

  if (!data?.id) {
    console.error("[admin/crm] saveLeadQuickNote: no row updated");
    return { ok: false, error: "save_failed" };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");

  return { ok: true };
}

export type DeleteLeadActivityResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid" | "not_found" | "not_deletable" | "save_failed" };

export async function deleteLeadActivity(formData: FormData): Promise<DeleteLeadActivityResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }
  const leadId = readTrimmedField(formData, "leadId");
  const activityId = readTrimmedField(formData, "activityId");
  if (!leadId || !activityId) {
    return { ok: false, error: "invalid" };
  }

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("lead_activities")
    .select("id, lead_id, event_type, deletable, deleted_at")
    .eq("id", activityId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (loadErr || !row?.id) {
    return { ok: false, error: "not_found" };
  }
  if (row.deleted_at) {
    return { ok: true };
  }
  if (row.event_type !== LEAD_ACTIVITY_EVENT.manual_note || !row.deletable) {
    return { ok: false, error: "not_deletable" };
  }

  const { error } = await supabaseAdmin
    .from("lead_activities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", activityId)
    .eq("lead_id", leadId);

  if (error) {
    console.warn("[admin/crm] deleteLeadActivity:", error.message);
    return { ok: false, error: "save_failed" };
  }

  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  return { ok: true };
}

/** Split display full name into CRM first/last (first token = first name, remainder = last). */
function splitFullNameToFirstLast(full: string): {
  full_name: string;
  first_name: string | null;
  last_name: string | null;
} {
  const t = full.trim();
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { full_name: "", first_name: null, last_name: null };
  }
  if (parts.length === 1) {
    return { full_name: t, first_name: parts[0], last_name: null };
  }
  return {
    full_name: t,
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
}

export async function updateLeadContactProfile(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const leadId = readTrimmedField(formData, "leadId");
  if (!leadId) {
    return;
  }

  const { data: leadRow, error: lErr } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("id, contact_id, dob").eq("id", leadId)
  ).maybeSingle();

  if (lErr || !leadRow?.contact_id) {
    console.warn("[admin/crm] updateLeadContactProfile lead:", lErr?.message);
    return;
  }

  const contactId = String(leadRow.contact_id);

  const { data: crow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select(
      "id, full_name, first_name, last_name, primary_phone, secondary_phone, email, address_line_1, address_line_2, city, state, zip, notes"
    )
    .eq("id", contactId)
    .maybeSingle();

  if (cErr || !crow?.id) {
    console.warn("[admin/crm] updateLeadContactProfile contact:", cErr?.message);
    return;
  }

  const fullNameRaw = readTrimmedField(formData, "contact_full_name");
  const primaryDigits = normalizePhone(readTrimmedField(formData, "primary_phone"));
  if (!fullNameRaw || !primaryDigits) {
    console.warn("[admin/crm] updateLeadContactProfile: full name and primary phone are required");
    return;
  }

  const nameParts = splitFullNameToFirstLast(fullNameRaw);

  const nextContact = {
    full_name: nameParts.full_name,
    first_name: nameParts.first_name,
    last_name: nameParts.last_name,
    primary_phone: primaryDigits,
    secondary_phone: readOptionalNormalizedPhone(formData, "secondary_phone"),
    email: readTrimmedOrNull(formData, "email"),
    address_line_1: readTrimmedOrNull(formData, "address_line_1"),
    address_line_2: readTrimmedOrNull(formData, "address_line_2"),
    city: readTrimmedOrNull(formData, "city"),
    state: readTrimmedOrNull(formData, "state"),
    zip: readTrimmedOrNull(formData, "zip"),
    notes: readTrimmedOrNull(formData, "contact_notes"),
  };

  const changes: FieldChange[] = [];
  for (const key of Object.keys(nextContact) as (keyof typeof nextContact)[]) {
    const d = diffString(`contacts.${key}`, (crow as Record<string, unknown>)[key], nextContact[key]);
    if (d) changes.push(d);
  }

  const { error: cu } = await supabaseAdmin.from("contacts").update(nextContact).eq("id", contactId);
  if (cu) {
    console.warn("[admin/crm] updateLeadContactProfile contacts update:", cu.message);
    return;
  }

  const dobIso = readOptionalDobIso(formData);
  const beforeDob =
    typeof leadRow.dob === "string"
      ? leadRow.dob.trim().slice(0, 10)
      : leadRow.dob instanceof Date
        ? leadRow.dob.toISOString().slice(0, 10)
        : "";
  const afterDob = dobIso ?? "";
  const { error: dobErr } = await supabaseAdmin
    .from("leads")
    .update({ dob: dobIso })
    .eq("id", leadId)
    .is("deleted_at", null);
  if (dobErr) {
    console.warn("[admin/crm] updateLeadContactProfile leads dob:", dobErr.message);
  } else if (beforeDob !== afterDob) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.dob_updated,
      body: `Date of birth changed from ${beforeDob || "—"} to ${afterDob || "—"}`,
      metadata: { before: beforeDob || null, after: afterDob || null },
      createdByUserId: staff.user_id,
    });
  }

  if (changes.length > 0) {
    await insertAuditLogTrusted({
      action: "crm_lead_contact_update",
      entityType: "lead",
      entityId: leadId,
      metadata: {
        contact_id: contactId,
        source: "crm",
        changes: truncateChanges(changes),
      },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${contactId}`);

  const { data: patRow } = await supabaseAdmin.from("patients").select("id").eq("contact_id", contactId).maybeSingle();
  if (patRow?.id) {
    const patientId = String(patRow.id);
    revalidatePath("/admin/crm/patients");
    revalidatePath(`/admin/crm/patients/${patientId}`);
    revalidatePath("/admin/crm/roster");
    revalidatePath(`/workspace/phone/patients/${patientId}`);
    revalidatePath("/workspace/phone/patients");
  }
}

export async function uploadLeadInsuranceCard(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const leadId = readTrimmedField(formData, "leadId");
  const slotRaw = readTrimmedField(formData, "slot");
  if (!leadId || !LEAD_OWNER_UUID_RE.test(leadId)) {
    return;
  }
  if (slotRaw !== "primary" && slotRaw !== "secondary") {
    return;
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File) || fileEntry.size < 1) {
    return;
  }

  if (fileEntry.size > LEAD_INSURANCE_MAX_BYTES) {
    console.warn("[admin/crm] uploadLeadInsuranceCard: file too large");
    return;
  }

  const mimeRaw = fileEntry.type || "application/octet-stream";
  if (!isAllowedLeadInsuranceMime(mimeRaw)) {
    console.warn("[admin/crm] uploadLeadInsuranceCard: disallowed mime", mimeRaw);
    return;
  }

  const { data: leadRow, error: lErr } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("id, primary_insurance_file_url, secondary_insurance_file_url")
      .eq("id", leadId)
  ).maybeSingle();

  if (lErr || !leadRow?.id) {
    console.warn("[admin/crm] uploadLeadInsuranceCard: lead not found");
    return;
  }

  const column =
    slotRaw === "primary" ? ("primary_insurance_file_url" as const) : ("secondary_insurance_file_url" as const);
  const prev = leadRow as Record<string, unknown>;
  const oldPath =
    typeof prev[column] === "string" && (prev[column] as string).trim() !== ""
      ? (prev[column] as string).trim()
      : "";

  const safeName = sanitizeLeadInsuranceFileName(fileEntry.name);
  const storagePath = `${leadId}/${slotRaw}-${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const contentType = mimeRaw.split(";")[0]?.trim() ?? "application/octet-stream";

  const { error: upErr } = await supabaseAdmin.storage.from(LEAD_INSURANCE_BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });

  if (upErr) {
    console.warn("[admin/crm] uploadLeadInsuranceCard storage:", upErr.message);
    return;
  }

  const { error: dbErr } = await supabaseAdmin
    .from("leads")
    .update({ [column]: storagePath })
    .eq("id", leadId)
    .is("deleted_at", null);

  if (dbErr) {
    console.warn("[admin/crm] uploadLeadInsuranceCard leads update:", dbErr.message);
    await supabaseAdmin.storage.from(LEAD_INSURANCE_BUCKET).remove([storagePath]).catch(() => {});
    return;
  }

  if (oldPath && oldPath !== storagePath) {
    await supabaseAdmin.storage.from(LEAD_INSURANCE_BUCKET).remove([oldPath]).catch(() => {});
  }

  await insertLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.document_uploaded,
    body:
      slotRaw === "primary"
        ? "Primary insurance card document uploaded or replaced"
        : "Secondary insurance card document uploaded or replaced",
    metadata: { slot: slotRaw, storage_path: storagePath },
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
}

export async function updatePatientIntake(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const idRaw = formData.get("patientId");
  const patientId = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!patientId) {
    return;
  }

  const disciplines = parseServiceDisciplinesFromFormData(formData);
  const payload = {
    referring_provider_name: readOptionalIntakeText(formData, "referring_provider_name"),
    referring_provider_phone: readOptionalNormalizedPhone(formData, "referring_provider_phone"),
    payer_name: readOptionalIntakeText(formData, "payer_name"),
    payer_type: readOptionalIntakeText(formData, "payer_type"),
    referral_source: readOptionalIntakeText(formData, "referral_source"),
    service_disciplines: disciplines,
    service_type: disciplines.length > 0 ? disciplines.join(", ") : null,
    intake_status: readOptionalIntakeText(formData, "intake_status"),
  };

  const { error } = await supabaseAdmin.from("patients").update(payload).eq("id", patientId);
  if (error) {
    console.warn("[admin/crm] updatePatientIntake:", error.message);
    return;
  }

  revalidatePath("/admin/crm/patients");
  revalidatePath(`/admin/crm/patients/${patientId}`);
  revalidatePath("/admin/crm/roster");
  revalidatePath(`/workspace/phone/patients/${patientId}`);
  revalidatePath("/workspace/phone/patients");
}

function readTrimmedOrNull(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseOptionalPositiveInt(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function updateCrmPatientCoreProfile(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const patientId = String(formData.get("patientId") ?? "").trim();
  if (!patientId) {
    return;
  }

  const { data: prow, error: pErr } = await supabaseAdmin
    .from("patients")
    .select("id, contact_id, visit_plan_summary, visit_plan_target_total, notes")
    .eq("id", patientId)
    .maybeSingle();

  if (pErr || !prow?.contact_id) {
    console.warn("[admin/crm] updateCrmPatientCoreProfile patient:", pErr?.message);
    return;
  }

  const contactId = prow.contact_id as string;

  const { data: crow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select(
      "id, full_name, first_name, last_name, primary_phone, secondary_phone, address_line_1, address_line_2, city, state, zip"
    )
    .eq("id", contactId)
    .maybeSingle();

  if (cErr || !crow?.id) {
    console.warn("[admin/crm] updateCrmPatientCoreProfile contact:", cErr?.message);
    return;
  }

  const nextContact = {
    full_name: readTrimmedOrNull(formData, "full_name"),
    first_name: readTrimmedOrNull(formData, "first_name"),
    last_name: readTrimmedOrNull(formData, "last_name"),
    primary_phone: readOptionalNormalizedPhone(formData, "primary_phone"),
    secondary_phone: readOptionalNormalizedPhone(formData, "secondary_phone"),
    address_line_1: readTrimmedOrNull(formData, "address_line_1"),
    address_line_2: readTrimmedOrNull(formData, "address_line_2"),
    city: readTrimmedOrNull(formData, "city"),
    state: readTrimmedOrNull(formData, "state"),
    zip: readTrimmedOrNull(formData, "zip"),
  };

  const nextPatient = {
    visit_plan_summary: readTrimmedOrNull(formData, "visit_plan_summary"),
    visit_plan_target_total: parseOptionalPositiveInt(formData, "visit_plan_target_total"),
    notes: readTrimmedOrNull(formData, "patient_notes"),
  };

  const changes: FieldChange[] = [];
  for (const key of Object.keys(nextContact) as (keyof typeof nextContact)[]) {
    const d = diffString(`contacts.${key}`, (crow as Record<string, unknown>)[key], nextContact[key]);
    if (d) changes.push(d);
  }
  const dSummary = diffString("patients.visit_plan_summary", prow.visit_plan_summary, nextPatient.visit_plan_summary);
  if (dSummary) changes.push(dSummary);
  const dTarget = diffNumber("patients.visit_plan_target_total", prow.visit_plan_target_total, nextPatient.visit_plan_target_total);
  if (dTarget) changes.push(dTarget);
  const dNotes = diffString("patients.notes", prow.notes, nextPatient.notes);
  if (dNotes) changes.push(dNotes);

  const { error: cu } = await supabaseAdmin.from("contacts").update(nextContact).eq("id", contactId);
  if (cu) {
    console.warn("[admin/crm] updateCrmPatientCoreProfile contacts update:", cu.message);
    return;
  }

  const { error: pu } = await supabaseAdmin
    .from("patients")
    .update({
      visit_plan_summary: nextPatient.visit_plan_summary,
      visit_plan_target_total: nextPatient.visit_plan_target_total,
      notes: nextPatient.notes,
    })
    .eq("id", patientId);
  if (pu) {
    console.warn("[admin/crm] updateCrmPatientCoreProfile patients update:", pu.message);
    return;
  }

  if (changes.length > 0) {
    await insertAuditLogTrusted({
      action: "crm_patient_profile_update",
      entityType: "patient",
      entityId: patientId,
      metadata: {
        contact_id: contactId,
        source: "crm",
        changes: truncateChanges(changes),
      },
    });
  }

  revalidatePath("/admin/crm/patients");
  revalidatePath(`/admin/crm/patients/${patientId}`);
  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${contactId}`);
  revalidatePath("/admin/crm/roster");
  revalidatePath(`/workspace/phone/patients/${patientId}`);
  revalidatePath("/workspace/phone/patients");
}

export async function convertLeadToPatientFromCrm(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const leadIdRaw = formData.get("leadId");
  const leadId = typeof leadIdRaw === "string" ? leadIdRaw.trim() : "";
  if (!leadId) {
    redirect("/admin/crm/patients/new?error=missing");
  }

  const res = await convertLeadToPatient(leadId);
  if (!res.ok) {
    redirect(`/admin/crm/patients/new?error=${encodeURIComponent(res.error)}`);
  }

  redirect(`/admin/crm/patients/${res.patientId}`);
}

export type SendLeadSmsResult = { ok: true } | { ok: false; error: string };

export async function sendLeadSms(leadId: string, message: string): Promise<SendLeadSmsResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "Not allowed." };
  }

  const lid = leadId.trim();
  const body = message.trim();
  if (!lid) {
    return { ok: false, error: "Missing lead." };
  }
  if (!body) {
    return { ok: false, error: "Message is required." };
  }

  const { data: leadRow, error: lErr } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("id, contact_id").eq("id", lid)
  ).maybeSingle();

  if (lErr || !leadRow?.contact_id) {
    return { ok: false, error: "Lead not found." };
  }

  const contactId = String(leadRow.contact_id);
  const result = await sendOutboundSmsForContact(contactId, body, "patient");

  if (result.ok) {
    await insertAuditLog({
      action: "crm_lead_sms_sent",
      entityType: "lead",
      entityId: lid,
      metadata: {
        contact_id: contactId,
        body_length: body.length,
      },
    });
    revalidatePath("/admin/crm/leads");
    revalidatePath(`/admin/crm/leads/${lid}`);
    return { ok: true };
  }

  await insertAuditLog({
    action: "crm_lead_sms_failed",
    entityType: "lead",
    entityId: lid,
    metadata: {
      contact_id: contactId,
      detail: result.error.slice(0, 500),
    },
  });
  return {
    ok: false,
    error:
      result.error.includes("primary") || result.error.includes("Contact not found")
        ? "No valid primary phone on file."
        : "SMS could not be sent. Try again or check Twilio logs.",
  };
}

export async function softDeleteLead(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/leads?toast=lead_delete_denied");
  }

  const leadId = readTrimmedField(formData, "leadId");
  if (!leadId) {
    redirect("/admin/crm/leads?toast=lead_delete_invalid");
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("leads")
    .update({ deleted_at: now })
    .eq("id", leadId)
    .is("deleted_at", null)
    .select("id, contact_id")
    .maybeSingle();

  if (error) {
    console.warn("[admin/crm] softDeleteLead:", error.message);
    redirect("/admin/crm/leads?toast=lead_delete_failed");
  }
  if (!updated?.id) {
    redirect("/admin/crm/leads?toast=lead_delete_gone");
  }

  const cid = typeof updated.contact_id === "string" ? updated.contact_id.trim() : "";

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/admin/crm/contacts");
  if (cid) {
    revalidatePath(`/admin/crm/contacts/${cid}`);
  }
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");
  revalidatePath("/workspace/phone/inbox");
  revalidatePath("/admin/phone");
  revalidatePath("/admin/phone/calls");

  redirect("/admin/crm/leads?toast=lead_deleted");
}

const LEAD_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Soft-delete multiple leads (same DB behavior as `softDeleteLead`). Returns counts; does not redirect. */
export async function bulkSoftDeleteLeads(
  leadIds: string[]
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const ids = [...new Set(leadIds.map((id) => String(id).trim()).filter((id) => LEAD_ID_UUID_RE.test(id)))];
  if (ids.length === 0) {
    return { ok: false, error: "invalid" };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("leads")
    .update({ deleted_at: now })
    .in("id", ids)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.warn("[admin/crm] bulkSoftDeleteLeads:", error.message);
    return { ok: false, error: error.message };
  }

  const deleted = data?.length ?? 0;

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath("/admin/crm/contacts");
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");
  revalidatePath("/workspace/phone/inbox");
  revalidatePath("/admin/phone");
  revalidatePath("/admin/phone/calls");

  return { ok: true, deleted };
}

export async function archiveContact(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/contacts?toast=contact_archive_denied");
  }

  const contactId = readTrimmedField(formData, "contactId");
  if (!contactId) {
    redirect("/admin/crm/contacts?toast=contact_archive_invalid");
  }

  const archiveContext = readTrimmedField(formData, "archiveContext");
  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("contacts")
    .update({ archived_at: now })
    .eq("id", contactId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[admin/crm] archiveContact:", error.message);
    redirect(
      archiveContext === "detail"
        ? `/admin/crm/contacts/${contactId}?toast=contact_archive_failed`
        : "/admin/crm/contacts?toast=contact_archive_failed"
    );
  }
  if (!updated?.id) {
    redirect(
      archiveContext === "detail"
        ? `/admin/crm/contacts/${contactId}?toast=contact_archive_gone`
        : "/admin/crm/contacts?toast=contact_archive_gone"
    );
  }

  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${contactId}`);
  revalidatePath("/admin/crm/leads");

  if (archiveContext === "detail") {
    redirect(`/admin/crm/contacts/${contactId}?toast=contact_archived`);
  }
  redirect("/admin/crm/contacts?toast=contact_archived");
}

export async function markLeadDead(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const leadId = readTrimmedField(formData, "leadId");
  if (!leadId) {
    return;
  }

  const { data: prevLead } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("status").eq("id", leadId)
  ).maybeSingle();

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ status: "dead_lead" })
    .eq("id", leadId)
    .is("deleted_at", null);

  if (error) {
    console.warn("[admin/crm] markLeadDead:", error.message);
    return;
  }

  await insertLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.marked_dead,
    body: `Status changed from ${formatLeadPipelineStatusLabel(normStr(prevLead?.status))} to ${formatLeadPipelineStatusLabel("dead_lead")}`,
    metadata: { before: normStr(prevLead?.status), after: "dead_lead" },
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  redirect(`/admin/crm/leads/${leadId}`);
}

export async function convertLeadToPatientFromLeadDetail(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/leads");
  }

  const leadId = readTrimmedField(formData, "leadId");
  if (!leadId) {
    redirect("/admin/crm/leads");
  }

  const res = await convertLeadToPatient(leadId);
  if (!res.ok) {
    redirect(`/admin/crm/leads/${leadId}?convertError=${encodeURIComponent(res.error)}`);
  }

  await insertLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.converted,
    body: "Lead converted to patient",
    metadata: { patient_id: res.patientId },
    createdByUserId: staff.user_id,
  });

  redirect(`/admin/crm/patients/${res.patientId}`);
}

function readTrimmedField(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export type CrmLeadListQuickActionResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid_lead" | "save_failed" };

/** List row: log spoke without clearing last_note / follow-up (does not mirror full outcome form). */
export async function quickMarkLeadSpoke(formData: FormData): Promise<CrmLeadListQuickActionResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }
  const leadId = readTrimmedField(formData, "leadId");
  if (!leadId) {
    return { ok: false, error: "invalid_lead" };
  }

  const { data: leadBefore, error: leadLoadErr } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("last_outcome, contacts ( full_name, first_name, last_name, primary_phone, email )")
      .eq("id", leadId)
  ).maybeSingle();

  if (leadLoadErr || !leadBefore) {
    return { ok: false, error: "invalid_lead" };
  }

  const lastContactAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("leads")
    .update({
      last_outcome: "spoke",
      last_contact_type: "call",
      last_contact_at: lastContactAt,
    })
    .eq("id", leadId)
    .is("deleted_at", null);

  if (error) {
    console.warn("[admin/crm] quickMarkLeadSpoke:", error.message);
    return { ok: false, error: "save_failed" };
  }

  const prev = typeof leadBefore.last_outcome === "string" ? leadBefore.last_outcome.trim() : "";
  if (prev !== "spoke") {
    const c = contactFieldsFromLeadContactJoin(leadBefore.contacts);
    notifyZapierLeadStatus({
      email: c.email,
      phone: c.phone,
      status: "spoke",
      name: c.name,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");
  return { ok: true };
}

/** List row: set follow-up to tomorrow (Central CRM calendar). */
export async function quickSetLeadFollowUpTomorrow(formData: FormData): Promise<CrmLeadListQuickActionResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }
  const leadId = readTrimmedField(formData, "leadId");
  if (!leadId) {
    return { ok: false, error: "invalid_lead" };
  }
  const tomorrow = getCrmCalendarTomorrowIso();

  const { data: prevLead } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("follow_up_date").eq("id", leadId)
  ).maybeSingle();

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ follow_up_date: tomorrow })
    .eq("id", leadId)
    .is("deleted_at", null);

  if (error) {
    console.warn("[admin/crm] quickSetLeadFollowUpTomorrow:", error.message);
    return { ok: false, error: "save_failed" };
  }

  await insertLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.follow_up_changed,
    body: `Follow-up changed from ${formatFollowUpDate(normStr(prevLead?.follow_up_date))} to ${formatFollowUpDate(tomorrow)}`,
    metadata: { before: normStr(prevLead?.follow_up_date), after: tomorrow },
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");
  return { ok: true };
}

/** Same as mark dead, but returns a result for list quick-action (no redirect). */
export async function markLeadDeadFromList(formData: FormData): Promise<CrmLeadListQuickActionResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }
  const leadId = readTrimmedField(formData, "leadId");
  if (!leadId) {
    return { ok: false, error: "invalid_lead" };
  }

  const { data: prevLead } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("status").eq("id", leadId)
  ).maybeSingle();

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ status: "dead_lead" })
    .eq("id", leadId)
    .is("deleted_at", null);

  if (error) {
    console.warn("[admin/crm] markLeadDeadFromList:", error.message);
    return { ok: false, error: "save_failed" };
  }

  await insertLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.marked_dead,
    body: `Status changed from ${formatLeadPipelineStatusLabel(normStr(prevLead?.status))} to ${formatLeadPipelineStatusLabel("dead_lead")}`,
    metadata: { before: normStr(prevLead?.status), after: "dead_lead" },
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  return { ok: true };
}

/** List view: quick-set visual triage (`leads.lead_temperature`). Does not change pipeline `status`. */
export async function quickSetLeadTemperature(formData: FormData): Promise<CrmLeadListQuickActionResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }
  const leadId = readTrimmedField(formData, "leadId");
  if (!leadId) {
    return { ok: false, error: "invalid_lead" };
  }
  const raw = formData.get("lead_temperature");
  if (typeof raw !== "string") {
    return { ok: false, error: "invalid_lead" };
  }
  const t = raw.trim();
  if (t === "") {
    return { ok: false, error: "invalid_lead" };
  }
  if (!isValidLeadTemperature(t)) {
    return { ok: false, error: "invalid_lead" };
  }

  const { data: prevRow } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("lead_temperature").eq("id", leadId)
  ).maybeSingle();

  const before = normalizeLeadTemperature(
    typeof prevRow?.lead_temperature === "string" ? prevRow.lead_temperature : null
  );

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ lead_temperature: t })
    .eq("id", leadId)
    .is("deleted_at", null);

  if (error) {
    console.warn("[admin/crm] quickSetLeadTemperature:", error.message);
    return { ok: false, error: "save_failed" };
  }

  if (before !== normalizeLeadTemperature(t)) {
    await insertLeadActivityRow({
      leadId,
      eventType: LEAD_ACTIVITY_EVENT.lead_temperature_updated,
      body: `Priority changed from ${leadTemperatureLabel(before)} to ${leadTemperatureLabel(normalizeLeadTemperature(t))}`,
      metadata: { before, after: t },
      createdByUserId: staff.user_id,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");
  return { ok: true };
}

export async function createPatientManualFromCrm(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/patients/new?manualError=forbidden");
  }

  const firstName = readTrimmedField(formData, "firstName");
  const lastName = readTrimmedField(formData, "lastName");
  const phoneRaw = readTrimmedField(formData, "primaryPhone");
  if (!firstName || !lastName) {
    redirect("/admin/crm/patients/new?manualError=validation_name");
  }
  if (!phoneRaw) {
    redirect("/admin/crm/patients/new?manualError=validation_phone");
  }

  const primary_phone = normalizePhone(phoneRaw);
  if (!primary_phone) {
    redirect("/admin/crm/patients/new?manualError=validation_phone");
  }

  const rawStatus = readTrimmedField(formData, "patientStatus");
  const patient_status =
    rawStatus === "active" ||
    rawStatus === "inactive" ||
    rawStatus === "discharged" ||
    rawStatus === "pending"
      ? rawStatus
      : "pending";

  const socRaw = readTrimmedField(formData, "startOfCare");
  const start_of_care =
    socRaw && /^\d{4}-\d{2}-\d{2}$/.test(socRaw) ? socRaw : null;

  const full_name = [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  const secondary_phone = readOptionalNormalizedPhone(formData, "secondary_phone");

  const { data: contactRow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      full_name,
      primary_phone,
      secondary_phone,
      email: readTrimmedOrNull(formData, "email"),
      address_line_1: readTrimmedOrNull(formData, "addressLine1"),
      address_line_2: readTrimmedOrNull(formData, "addressLine2"),
      city: readTrimmedOrNull(formData, "city"),
      state: readTrimmedOrNull(formData, "state"),
      zip: readTrimmedOrNull(formData, "zip"),
    })
    .select("id")
    .single();

  if (cErr || !contactRow?.id) {
    console.warn("[admin/crm] createPatientManualFromCrm contact:", cErr?.message);
    redirect("/admin/crm/patients/new?manualError=contact_insert_failed");
  }

  const contactId = contactRow.id as string;

  const manualDisciplines = parseServiceDisciplinesFromFormData(formData, "service_disciplines");

  const { data: newPatient, error: pErr } = await supabaseAdmin
    .from("patients")
    .insert({
      contact_id: contactId,
      patient_status,
      start_of_care,
      payer_name: readTrimmedOrNull(formData, "payerName"),
      payer_type: readTrimmedOrNull(formData, "payerType"),
      service_disciplines: manualDisciplines,
      service_type: manualDisciplines.length > 0 ? manualDisciplines.join(", ") : null,
    })
    .select("id")
    .single();

  if (pErr || !newPatient?.id) {
    console.warn("[admin/crm] createPatientManualFromCrm patient:", pErr?.message);
    await supabaseAdmin.from("contacts").delete().eq("id", contactId);
    redirect("/admin/crm/patients/new?manualError=patient_insert_failed");
  }

  const patientId = newPatient.id as string;

  const assignedUserId = readTrimmedField(formData, "assignedUserId");
  if (assignedUserId) {
    const fd = new FormData();
    fd.set("patientId", patientId);
    fd.set("assignedUserId", assignedUserId);
    fd.set("role", "primary_nurse");
    await assignPatientToStaff(fd);
  }

  revalidatePath("/admin/crm/patients");
  revalidatePath(`/admin/crm/patients/${patientId}`);
  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${contactId}`);
  revalidatePath("/admin/crm/roster");
  revalidatePath("/workspace/phone/patients");
  revalidatePath("/workspace/phone");

  redirect(`/admin/crm/patients/${patientId}`);
}

export async function createLeadManualFromCrm(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin/crm/leads/new?manualError=forbidden");
  }

  const firstName = readTrimmedField(formData, "firstName");
  const lastName = readTrimmedField(formData, "lastName");
  const phoneRaw = readTrimmedField(formData, "primaryPhone");
  if (!firstName || !lastName) {
    redirect("/admin/crm/leads/new?manualError=validation_name");
  }
  if (!phoneRaw) {
    redirect("/admin/crm/leads/new?manualError=validation_phone");
  }

  const sourceRaw = readTrimmedField(formData, "source");
  if (!isValidLeadSource(sourceRaw)) {
    redirect("/admin/crm/leads/new?manualError=validation_source");
  }

  const primary_phone = normalizePhone(phoneRaw);
  if (!primary_phone) {
    redirect("/admin/crm/leads/new?manualError=validation_phone");
  }
  const full_name = [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  const secondary_phone = readOptionalNormalizedPhone(formData, "secondary_phone");

  const intake = readIntakeRequestFromForm(formData);
  const extMeta = hasAnyIntakeRequestDetail(intake) ? { intake_request: intake } : null;

  const { data: contactRow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      full_name,
      primary_phone,
      secondary_phone,
      email: readTrimmedOrNull(formData, "email"),
      zip: readOptionalIntakeText(formData, "intake_zip_code"),
    })
    .select("id")
    .single();

  if (cErr || !contactRow?.id) {
    console.warn("[admin/crm] createLeadManualFromCrm contact:", cErr?.message);
    redirect("/admin/crm/leads/new?manualError=contact_insert_failed");
  }

  const contactId = contactRow.id as string;
  const disciplines = parseServiceDisciplinesFromFormData(formData, "service_disciplines");

  const { data: newLead, error: lErr } = await supabaseAdmin
    .from("leads")
    .insert({
      contact_id: contactId,
      source: sourceRaw,
      status: "new",
      owner_user_id: readOptionalOwnerUserId(formData),
      next_action: readLeadNextActionFromForm(formData),
      follow_up_date: readOptionalFollowUpDateIso(formData),
      referring_doctor_name: readOptionalIntakeText(formData, "referring_doctor_name"),
      doctor_office_name: readOptionalIntakeText(formData, "doctor_office_name"),
      doctor_office_phone: readOptionalNormalizedPhone(formData, "doctor_office_phone"),
      doctor_office_fax: readOptionalNormalizedPhone(formData, "doctor_office_fax"),
      doctor_office_contact_person: readOptionalIntakeText(formData, "doctor_office_contact_person"),
      referring_provider_name: readOptionalIntakeText(formData, "referring_provider_name"),
      referring_provider_phone: readOptionalNormalizedPhone(formData, "referring_provider_phone"),
      payer_name: readOptionalIntakeText(formData, "payer_name"),
      payer_type: readOptionalIntakeText(formData, "payer_type"),
      referral_source: readOptionalIntakeText(formData, "referral_source"),
      service_disciplines: disciplines,
      service_type: disciplines.length > 0 ? disciplines.join(", ") : null,
      intake_status: readOptionalIntakeText(formData, "intake_status"),
      external_source_metadata: extMeta,
      notes: readOptionalIntakeText(formData, "lead_notes"),
    })
    .select("id")
    .single();

  if (lErr || !newLead?.id) {
    console.warn("[admin/crm] createLeadManualFromCrm lead:", lErr?.message);
    await supabaseAdmin.from("contacts").delete().eq("id", contactId);
    redirect("/admin/crm/leads/new?manualError=lead_insert_failed");
  }

  const leadId = newLead.id as string;

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${contactId}`);
  redirect(`/admin/crm/leads/${leadId}`);
}

export async function updateCrmPatientStatus(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const patientId = readTrimmedField(formData, "patientId");
  const raw = readTrimmedField(formData, "patient_status");
  const returnTo = readTrimmedField(formData, "returnTo");

  if (!patientId || !raw) {
    return;
  }
  if (!["active", "inactive", "discharged", "pending"].includes(raw)) {
    return;
  }

  const { error } = await supabaseAdmin.from("patients").update({ patient_status: raw }).eq("id", patientId);

  if (error) {
    console.warn("[admin/crm] updateCrmPatientStatus:", error.message);
    return;
  }

  revalidatePath("/admin/crm/patients");
  revalidatePath(`/admin/crm/patients/${patientId}`);
  revalidatePath("/admin/crm/roster");
  revalidatePath(`/workspace/phone/patients/${patientId}`);
  revalidatePath("/workspace/phone/patients");

  redirect(returnTo ? `/admin/crm/patients?${returnTo}` : "/admin/crm/patients");
}
