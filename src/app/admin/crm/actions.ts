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
import {
  isValidLeadContactOutcome,
  isValidLeadContactType,
} from "@/lib/crm/lead-contact-outcome";
import { isValidLeadNextAction } from "@/lib/crm/lead-follow-up-options";
import { isValidLeadPipelineStatus } from "@/lib/crm/lead-pipeline-status";
import { isValidLeadSource } from "@/lib/crm/lead-source-options";
import { isValidServiceDisciplineCode, parseServiceDisciplinesFromFormData } from "@/lib/crm/service-disciplines";
import { convertLeadToPatient } from "@/app/admin/phone/actions";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

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

  const { error: insErr } = await supabaseAdmin.from("patient_visits").insert({
    patient_id: patientId,
    assigned_user_id: assignedUserId,
    scheduled_for: scheduledFor,
    status: "scheduled",
  });

  if (insErr) {
    console.warn("[admin/crm] createPatientVisit insert:", insErr.message);
    return;
  }

  revalidatePath(`/admin/crm/patients/${patientId}/visits`);
  revalidatePath("/admin/crm/patients");
  revalidatePath("/admin/crm/dispatch");
  revalidatePath(`/workspace/phone/patients/${patientId}`);
  revalidatePath("/workspace/phone/patients");
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

  const { error: uErr } = await supabaseAdmin.from("patient_visits").update({ status: nextStatus }).eq("id", visitId);

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
    revalidatePath(`/admin/crm/patients/${patientId}`);
    revalidatePath(`/admin/crm/patients/${patientId}/visits`);
    revalidatePath("/admin/crm/patients");
    revalidatePath("/admin/crm/dispatch");
    revalidatePath(`/workspace/phone/patients/${patientId}`);
    revalidatePath("/workspace/phone/patients");

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

  revalidatePath(`/admin/crm/patients/${patientId}`);
  revalidatePath(`/admin/crm/patients/${patientId}/visits`);
  revalidatePath("/admin/crm/patients");
  revalidatePath("/admin/crm/dispatch");
  revalidatePath(`/workspace/phone/patients/${patientId}`);
  revalidatePath("/workspace/phone/patients");
}

function readOptionalIntakeText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
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
  };

  const { error } = await supabaseAdmin.from("leads").update(payload).eq("id", leadId);
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

export async function saveLeadContactOutcome(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const idRaw = formData.get("leadId");
  const leadId = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!leadId) {
    return;
  }

  const outcomeRaw = formData.get("outcome");
  const outcome = typeof outcomeRaw === "string" ? outcomeRaw.trim() : "";
  if (!outcome || !isValidLeadContactOutcome(outcome)) {
    return;
  }

  const typeRaw = formData.get("contact_type");
  const contactType = typeof typeRaw === "string" ? typeRaw.trim() : "";
  if (!contactType || !isValidLeadContactType(contactType)) {
    return;
  }

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim().slice(0, 4000) : "";

  const nextAction = readLeadNextActionFromForm(formData);
  const followUpDate = readOptionalFollowUpDateIso(formData);

  const { error } = await supabaseAdmin
    .from("leads")
    .update({
      last_contact_at: new Date().toISOString(),
      last_contact_type: contactType,
      last_outcome: outcome,
      last_note: notes === "" ? null : notes,
      next_action: nextAction,
      follow_up_date: followUpDate,
    })
    .eq("id", leadId);

  if (error) {
    console.warn("[admin/crm] saveLeadContactOutcome:", error.message);
    return;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/follow-ups-today");
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

  const { data: leadRow, error: lErr } = await supabaseAdmin
    .from("leads")
    .select("id, contact_id")
    .eq("id", leadId)
    .maybeSingle();

  if (lErr || !leadRow?.contact_id) {
    console.warn("[admin/crm] updateLeadContactProfile lead:", lErr?.message);
    return;
  }

  const contactId = String(leadRow.contact_id);

  const { data: crow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select(
      "id, full_name, first_name, last_name, primary_phone, email, address_line_1, address_line_2, city, state, zip, notes"
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

  const { data: leadRow, error: lErr } = await supabaseAdmin
    .from("leads")
    .select("id, contact_id")
    .eq("id", lid)
    .maybeSingle();

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

export async function markLeadDead(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const leadId = readTrimmedField(formData, "leadId");
  if (!leadId) {
    return;
  }

  const { error } = await supabaseAdmin.from("leads").update({ status: "dead_lead" }).eq("id", leadId);

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

  const { data: contactRow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      full_name,
      primary_phone,
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

  const { data: contactRow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      full_name,
      primary_phone,
      secondary_phone,
      email: readTrimmedOrNull(formData, "email"),
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
