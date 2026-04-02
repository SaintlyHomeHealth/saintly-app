"use server";

import { revalidatePath } from "next/cache";

import { insertAuditLogTrusted } from "@/lib/audit-log";
import { diffString, truncateChanges, type FieldChange } from "@/lib/crm/patient-profile-diff";
import { NURSE_ON_THE_WAY_MESSAGE, nurseLabelFromStaffEmail } from "@/lib/crm/patient-sms";
import { VISIT_STATUS_TRANSITIONS } from "@/lib/crm/patient-visit-status";
import { findOpenDuplicatePatientVisitId } from "@/lib/crm/dispatch-duplicate-visit";
import { buildVisitSnapshotsFromContact, type ContactSnapshotInput } from "@/lib/crm/dispatch-visit";
import { sendOutboundSmsForPatient, type OutboundSmsRecipient } from "@/lib/crm/outbound-patient-sms";
import { supabaseAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

async function assertWorkspacePatientAccess(staffUserId: string, patientId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("patient_assignments")
    .select("id")
    .eq("assigned_user_id", staffUserId)
    .eq("patient_id", patientId)
    .eq("is_active", true)
    .limit(1);

  if (error) {
    console.warn("[workspace/patients] assertWorkspacePatientAccess", error.message);
    return false;
  }
  return Boolean(data?.length);
}

async function loadWorkspaceVisitForStaff(staffUserId: string, visitId: string): Promise<{
  id: string;
  patient_id: string;
  status: string;
} | null> {
  const { data: row, error } = await supabaseAdmin
    .from("patient_visits")
    .select("id, patient_id, status, assigned_user_id")
    .eq("id", visitId)
    .maybeSingle();
  if (error || !row?.id || !row.patient_id) {
    return null;
  }
  const assignee = typeof row.assigned_user_id === "string" ? row.assigned_user_id : null;
  const byVisitAssignee = assignee === staffUserId;
  const byPatientAssignment = await assertWorkspacePatientAccess(staffUserId, String(row.patient_id));
  if (!byVisitAssignee && !byPatientAssignment) return null;
  return {
    id: String(row.id),
    patient_id: String(row.patient_id),
    status: typeof row.status === "string" ? row.status : "",
  };
}

function parseReminderRecipient(raw: string): OutboundSmsRecipient {
  if (raw === "caregiver" || raw === "both") return raw;
  return "patient";
}

function readOptionalBoundedFloat(formData: FormData, key: string, min: number, max: number): number | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export async function scheduleWorkspacePatientVisit(formData: FormData): Promise<
  | { ok: true }
  | {
      ok: false;
      error: string;
    }
> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "Not allowed." };
  }

  const patientId = String(formData.get("patientId") ?? "").trim();
  const dateRaw = String(formData.get("visitDate") ?? "").trim();
  const timeRaw = String(formData.get("visitTime") ?? "").trim();
  const noteRaw = String(formData.get("visitNote") ?? "").trim();
  const reminderRaw = String(formData.get("reminderRecipient") ?? "patient").trim();

  if (!patientId || !dateRaw || !timeRaw) {
    return { ok: false, error: "Date and time are required." };
  }

  if (!(await assertWorkspacePatientAccess(staff.user_id, patientId))) {
    return { ok: false, error: "Not assigned to this patient." };
  }

  const scheduledFor = new Date(`${dateRaw}T${timeRaw}:00`);
  if (Number.isNaN(scheduledFor.getTime())) {
    return { ok: false, error: "Invalid date or time." };
  }

  const reminderRecipient = parseReminderRecipient(reminderRaw);

  const { data: patientRow, error: snapErr } = await supabaseAdmin
    .from("patients")
    .select("id, contact_id, contacts ( primary_phone, address_line_1, address_line_2, city, state, zip )")
    .eq("id", patientId)
    .maybeSingle();

  if (snapErr) {
    console.warn("[workspace/patients] scheduleWorkspacePatientVisit snapshot load", snapErr.message);
  }
  const cRaw = patientRow?.contacts as Record<string, unknown> | Record<string, unknown>[] | null | undefined;
  const contactEmb = (Array.isArray(cRaw) ? cRaw[0] : cRaw) as ContactSnapshotInput | null;
  const snapshots = buildVisitSnapshotsFromContact(contactEmb);

  const scheduledIso = scheduledFor.toISOString();
  const dupId = await findOpenDuplicatePatientVisitId({
    patientId,
    scheduledForIso: scheduledIso,
    scheduledEndAtIso: null,
    assignedUserId: staff.user_id,
  });
  if (dupId) {
    return {
      ok: false,
      error: "A visit is already scheduled for this patient at this time.",
    };
  }

  const { error: insErr } = await supabaseAdmin.from("patient_visits").insert({
    patient_id: patientId,
    assigned_user_id: staff.user_id,
    scheduled_for: scheduledIso,
    status: "scheduled",
    visit_note: noteRaw ? noteRaw : null,
    reminder_recipient: reminderRecipient,
    created_from: "workspace_phone",
    patient_phone_snapshot: snapshots.patient_phone_snapshot,
    address_snapshot: snapshots.address_snapshot,
  });

  if (insErr) {
    console.warn("[workspace/patients] scheduleWorkspacePatientVisit", insErr.message);
    return { ok: false, error: "Could not save visit." };
  }

  revalidatePath(`/workspace/phone/patients/${patientId}`);
  revalidatePath("/workspace/phone/patients");
  revalidatePath("/workspace/phone/today");
  revalidatePath("/admin/crm/dispatch");
  return { ok: true };
}

export async function sendWorkspacePatientSms(input: {
  patientId: string;
  body: string;
  recipient: OutboundSmsRecipient;
  /** Merged into audit metadata (e.g. preset, nurse_label) — does not change SMS routing. */
  auditExtra?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "Not allowed." };
  }

  const pid = input.patientId.trim();
  if (!pid) {
    return { ok: false, error: "Missing patient." };
  }
  if (!(await assertWorkspacePatientAccess(staff.user_id, pid))) {
    return { ok: false, error: "Not assigned to this patient." };
  }

  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: "Message is required." };
  }

  const result = await sendOutboundSmsForPatient(pid, body, input.recipient);
  if (!result.ok) {
    await insertAuditLogTrusted({
      action: "workspace_patient_sms_failed",
      entityType: "patient",
      entityId: pid,
      metadata: { error: result.error.slice(0, 400), recipient: input.recipient, ...(input.auditExtra ?? {}) },
    });
    return { ok: false, error: result.error };
  }

  await insertAuditLogTrusted({
    action: "workspace_patient_sms_sent",
    entityType: "patient",
    entityId: pid,
    metadata: { recipient: input.recipient, body_length: body.length, ...(input.auditExtra ?? {}) },
  });

  revalidatePath(`/workspace/phone/patients/${pid}`);
  revalidatePath("/workspace/phone/patients");
  return { ok: true };
}

export async function sendWorkspaceOnMyWaySms(patientId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "Not allowed." };
  }
  const pid = patientId.trim();
  if (!(await assertWorkspacePatientAccess(staff.user_id, pid))) {
    return { ok: false, error: "Not assigned to this patient." };
  }

  const name =
    typeof staff.full_name === "string" && staff.full_name.trim()
      ? staff.full_name.trim()
      : nurseLabelFromStaffEmail(staff.email);
  const body =
    name != null
      ? `Hi from Saintly Home Health — ${name} is on the way. Reply if you need anything.`
      : NURSE_ON_THE_WAY_MESSAGE;

  return sendWorkspacePatientSms({
    patientId: pid,
    body,
    recipient: "patient",
    auditExtra: { preset: "on_my_way", nurse_label: name ?? null },
  });
}

function readTrimmedOrNull(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function readNormalizedPhoneOrNull(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const d = normalizePhone(v);
  return d === "" ? null : d;
}

export async function updateWorkspacePatientOperationalProfile(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "Not allowed." };
  }

  const patientId = String(formData.get("patientId") ?? "").trim();
  if (!patientId) {
    return { ok: false, error: "Missing patient." };
  }

  if (!(await assertWorkspacePatientAccess(staff.user_id, patientId))) {
    return { ok: false, error: "Not assigned to this patient." };
  }

  const { data: prow, error: pErr } = await supabaseAdmin
    .from("patients")
    .select("id, contact_id, notes")
    .eq("id", patientId)
    .maybeSingle();

  if (pErr || !prow?.contact_id) {
    return { ok: false, error: "Patient not found." };
  }

  const contactId = prow.contact_id as string;

  const { data: crow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select("id, full_name, primary_phone, secondary_phone, address_line_1, address_line_2, city, state, zip")
    .eq("id", contactId)
    .maybeSingle();

  if (cErr || !crow?.id) {
    return { ok: false, error: "Contact not found." };
  }

  const nextContact = {
    full_name: readTrimmedOrNull(formData, "full_name"),
    primary_phone: readNormalizedPhoneOrNull(formData, "primary_phone"),
    secondary_phone: readNormalizedPhoneOrNull(formData, "secondary_phone"),
    address_line_1: readTrimmedOrNull(formData, "address_line_1"),
    address_line_2: readTrimmedOrNull(formData, "address_line_2"),
    city: readTrimmedOrNull(formData, "city"),
    state: readTrimmedOrNull(formData, "state"),
    zip: readTrimmedOrNull(formData, "zip"),
  };

  const nextPatient = {
    notes: readTrimmedOrNull(formData, "patient_notes"),
  };

  const changes: FieldChange[] = [];
  for (const key of Object.keys(nextContact) as (keyof typeof nextContact)[]) {
    const d = diffString(`contacts.${key}`, (crow as Record<string, unknown>)[key], nextContact[key]);
    if (d) changes.push(d);
  }
  const dNotes = diffString("patients.notes", prow.notes, nextPatient.notes);
  if (dNotes) changes.push(dNotes);

  const { error: cu } = await supabaseAdmin.from("contacts").update(nextContact).eq("id", contactId);
  if (cu) {
    console.warn("[workspace/patients] updateWorkspacePatientOperationalProfile contact", cu.message);
    return { ok: false, error: "Could not save contact." };
  }

  const { error: pu } = await supabaseAdmin.from("patients").update(nextPatient).eq("id", patientId);
  if (pu) {
    console.warn("[workspace/patients] updateWorkspacePatientOperationalProfile patient", pu.message);
    return { ok: false, error: "Could not save patient notes." };
  }

  if (changes.length > 0) {
    await insertAuditLogTrusted({
      action: "workspace_patient_profile_update",
      entityType: "patient",
      entityId: patientId,
      metadata: {
        contact_id: contactId,
        source: "workspace",
        changes: truncateChanges(changes),
      },
    });
  }

  revalidatePath(`/workspace/phone/patients/${patientId}`);
  revalidatePath("/workspace/phone/patients");
  revalidatePath(`/admin/crm/patients/${patientId}`);
  return { ok: true };
}

export async function setWorkspaceVisitStatus(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "Not allowed." };
  }

  const visitId = String(formData.get("visitId") ?? "").trim();
  const nextStatus = String(formData.get("nextStatus") ?? "").trim();
  if (!visitId || !nextStatus) {
    return { ok: false, error: "Missing visit update." };
  }

  const visit = await loadWorkspaceVisitForStaff(staff.user_id, visitId);
  if (!visit) {
    return { ok: false, error: "Visit not found." };
  }

  const allowed = VISIT_STATUS_TRANSITIONS[visit.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    return { ok: false, error: "Status transition not allowed." };
  }

  const nowIso = new Date().toISOString();
  const lat = readOptionalBoundedFloat(formData, "lat", -90, 90);
  const lng = readOptionalBoundedFloat(formData, "lng", -180, 180);
  const accuracy = readOptionalBoundedFloat(formData, "accuracyMeters", 0, 100000);

  const updatePayload: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "en_route") {
    updatePayload.en_route_at = nowIso;
  } else if (nextStatus === "arrived") {
    updatePayload.arrived_at = nowIso;
    if (lat != null && lng != null) {
      updatePayload.arrived_lat = lat;
      updatePayload.arrived_lng = lng;
      updatePayload.arrived_accuracy_meters = accuracy;
    }
  } else if (nextStatus === "completed") {
    updatePayload.completed_at = nowIso;
    if (lat != null && lng != null) {
      updatePayload.completed_lat = lat;
      updatePayload.completed_lng = lng;
      updatePayload.completed_accuracy_meters = accuracy;
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from("patient_visits")
    .update(updatePayload)
    .eq("id", visitId);
  if (updateErr) {
    console.warn("[workspace/patients] setWorkspaceVisitStatus", updateErr.message);
    return { ok: false, error: "Could not update visit status." };
  }

  revalidatePath("/workspace/phone/today");
  revalidatePath(`/workspace/phone/patients/${visit.patient_id}`);
  revalidatePath("/workspace/phone/patients");
  revalidatePath("/admin/crm/dispatch");
  return { ok: true };
}

export async function rescheduleWorkspaceVisit(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "Not allowed." };
  }

  const visitId = String(formData.get("visitId") ?? "").trim();
  const dateRaw = String(formData.get("visitDate") ?? "").trim();
  const timeRaw = String(formData.get("visitTime") ?? "").trim();
  if (!visitId || !dateRaw || !timeRaw) {
    return { ok: false, error: "Date and time are required." };
  }

  const visit = await loadWorkspaceVisitForStaff(staff.user_id, visitId);
  if (!visit) {
    return { ok: false, error: "Visit not found." };
  }
  if (visit.status === "completed" || visit.status === "canceled") {
    return { ok: false, error: "Completed/canceled visits cannot be rescheduled." };
  }

  const scheduledFor = new Date(`${dateRaw}T${timeRaw}:00`);
  if (Number.isNaN(scheduledFor.getTime())) {
    return { ok: false, error: "Invalid date or time." };
  }

  const { error: updateErr } = await supabaseAdmin
    .from("patient_visits")
    .update({
      status: "scheduled",
      scheduled_for: scheduledFor.toISOString(),
      scheduled_end_at: null,
      time_window_label: null,
      reminder_day_before_sent_at: null,
      reminder_day_of_sent_at: null,
      assigned_user_id: staff.user_id,
      en_route_at: null,
      arrived_at: null,
      completed_at: null,
      arrived_lat: null,
      arrived_lng: null,
      arrived_accuracy_meters: null,
      completed_lat: null,
      completed_lng: null,
      completed_accuracy_meters: null,
    })
    .eq("id", visitId);
  if (updateErr) {
    console.warn("[workspace/patients] rescheduleWorkspaceVisit", updateErr.message);
    return { ok: false, error: "Could not reschedule visit." };
  }

  revalidatePath("/workspace/phone/today");
  revalidatePath(`/workspace/phone/patients/${visit.patient_id}`);
  revalidatePath("/workspace/phone/patients");
  revalidatePath("/admin/crm/dispatch");
  return { ok: true };
}
