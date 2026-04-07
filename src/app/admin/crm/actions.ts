"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { insertAuditLog, insertAuditLogTrusted } from "@/lib/audit-log";
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
  isValidLeadContactOutcome,
  isValidLeadContactType,
} from "@/lib/crm/lead-contact-outcome";
import { isValidLeadNextAction } from "@/lib/crm/lead-follow-up-options";
import { isValidLeadPipelineStatus } from "@/lib/crm/lead-pipeline-status";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { isValidLeadSource } from "@/lib/crm/lead-source-options";
import {
  hasAnyIntakeRequestDetail,
  type LeadIntakeRequestDetails,
} from "@/lib/crm/lead-intake-request";
import { isValidServiceDisciplineCode, parseServiceDisciplinesFromFormData } from "@/lib/crm/service-disciplines";
import { convertLeadToPatient } from "@/app/admin/phone/actions";
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

function readLeadNextActionFromForm(formData: FormData): string | null {
  const v = formData.get("next_action");
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (!isValidLeadNextAction(t)) return null;
  return t;
}

function readLeadPipelineStatusFromForm(formData: FormData): string | null {
  const v = formData.get("pipeline_status");
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (!isValidLeadPipelineStatus(t)) return null;
  return t;
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
  };

  const { error } = await supabaseAdmin.from("leads").update(payload).eq("id", leadId).is("deleted_at", null);
  if (error) {
    console.warn("[admin/crm] updateLeadIntake:", error.message);
    return;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");
}

export type SaveLeadOutcomeResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid_lead" | "invalid_outcome" | "invalid_contact_type" | "save_failed" };

/**
 * Persists a contact attempt on the lead (`leads.last_*` columns — equivalent to a lead_outcomes row; no separate table).
 */
export async function saveLeadOutcome(formData: FormData): Promise<SaveLeadOutcomeResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    console.warn("[admin/crm] saveLeadOutcome: forbidden");
    return { ok: false, error: "forbidden" };
  }

  const received: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    received[k] = typeof v === "string" ? v : String(v);
  }
  console.log("[admin/crm] saveLeadOutcome received", received);

  const idRaw = formData.get("leadId");
  const leadId = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!leadId) {
    return { ok: false, error: "invalid_lead" };
  }

  const outcomeRaw = formData.get("outcome");
  const outcome = typeof outcomeRaw === "string" ? outcomeRaw.trim() : "";
  if (!outcome || !isValidLeadContactOutcome(outcome)) {
    return { ok: false, error: "invalid_outcome" };
  }

  const typeRaw = formData.get("contact_type");
  const contactType = typeof typeRaw === "string" ? typeRaw.trim() : "";
  if (!contactType || !isValidLeadContactType(contactType)) {
    return { ok: false, error: "invalid_contact_type" };
  }

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim().slice(0, 4000) : "";

  const nextAction = readLeadNextActionFromForm(formData);
  const followUpDate = readOptionalFollowUpDateIso(formData);

  const lastContactAt = new Date().toISOString();
  const payloadLog = {
    lead_id: leadId,
    outcome,
    created_by: staff.user_id,
    notes: notes === "" ? null : notes,
    next_action: nextAction,
    follow_up_date: followUpDate,
    last_contact_type: contactType,
    last_contact_at: lastContactAt,
  };
  console.log("[admin/crm] saveLeadOutcome payload (before persist)", JSON.stringify(payloadLog));

  const rowUpdate = {
    last_contact_at: lastContactAt,
    last_contact_type: contactType,
    last_outcome: outcome,
    last_note: notes === "" ? null : notes,
    next_action: nextAction,
    follow_up_date: followUpDate,
  };

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update(rowUpdate)
    .eq("id", leadId)
    .is("deleted_at", null)
    .select("id, last_outcome, last_contact_at, next_action, follow_up_date, last_note")
    .maybeSingle();

  if (error) {
    console.error("[admin/crm] saveLeadOutcome DB error:", error.message, error);
    return { ok: false, error: "save_failed" };
  }

  if (!data?.id) {
    console.error("[admin/crm] saveLeadOutcome: no row updated (lead missing or deleted?)");
    return { ok: false, error: "save_failed" };
  }

  console.log("[admin/crm] saveLeadOutcome DB response:", JSON.stringify(data));

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");

  return { ok: true };
}

export type SaveLeadQuickNoteResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid_lead" | "empty" | "load_failed" | "save_failed" };

/**
 * Appends a timestamped line to `leads.last_note` and bumps `last_contact_at`.
 * No separate history table — running context lives in the same fields as contact outcomes.
 */
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
    supabaseAdmin.from("leads").select("last_note").eq("id", leadId)
  ).maybeSingle();

  if (loadErr) {
    console.error("[admin/crm] saveLeadQuickNote load:", loadErr.message);
    return { ok: false, error: "load_failed" };
  }
  if (!prevRow) {
    return { ok: false, error: "load_failed" };
  }

  const prev = typeof prevRow.last_note === "string" ? prevRow.last_note : "";
  const stamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const line = `[Quick note ${stamp}] ${note}`;
  const nextNote = prev.trim() ? `${prev.trim()}\n\n${line}` : line;

  const { data, error } = await supabaseAdmin
    .from("leads")
    .update({
      last_note: nextNote,
      last_contact_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .is("deleted_at", null)
    .select("id, last_note, last_contact_at")
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
    supabaseAdmin.from("leads").select("id, contact_id").eq("id", leadId)
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

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ status: "dead_lead" })
    .eq("id", leadId)
    .is("deleted_at", null);

  if (error) {
    console.warn("[admin/crm] markLeadDead:", error.message);
    return;
  }

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

  redirect(`/admin/crm/patients/${res.patientId}`);
}

function readTrimmedField(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
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
