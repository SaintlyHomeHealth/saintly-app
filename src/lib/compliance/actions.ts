"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { canUnlockCompliance, canUseComplianceLogs, staffDisplayName } from "@/lib/compliance/access";
import {
  EMERGENCY_REVIEW_ITEMS,
  EXERCISE_TYPES,
  INCIDENT_TYPES,
  MEETING_TYPES,
  NIL_ON_CALL_STATEMENT,
  PROJECT_STATUSES,
  QAPI_COUNT_FIELDS,
  SAFETY_ITEMS,
  type NaItemKey,
  type QapiAutoKey,
} from "@/lib/compliance/constants";
import { monthRangeIso, periodFromYmd, quarterRangeIso } from "@/lib/compliance/period";
import { qapiLiveCounts } from "@/lib/compliance/queries";
import type { ActionResult } from "@/lib/compliance/types";
import { combineAppCalendarDateAndTimeToUtcIso } from "@/lib/datetime/app-timezone";
import { getStaffProfile, type StaffProfile } from "@/lib/staff-profile";

const NA_KEYS = new Set<NaItemKey>(["meetings", "safety", "emergency_review", "drill", "qapi_review"]);
const AUTO_KEYS: QapiAutoKey[] = [
  "hospitalizations",
  "er_visits",
  "falls",
  "medication_errors",
  "complaints",
  "missed_visits",
  "infections",
];

function refresh() {
  revalidatePath("/admin/compliance", "layout");
}

async function actor(): Promise<StaffProfile> {
  const staff = await getStaffProfile();
  if (!staff || !canUseComplianceLogs(staff)) {
    throw new Error("You do not have access to Compliance Logs.");
  }
  return staff;
}

function text(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function dateField(form: FormData, key: string): string | null {
  const value = text(form, key);
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function timeField(form: FormData, key: string): string | null {
  const value = text(form, key);
  if (!value) return null;
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : null;
}

function oneOf(value: string | null, allowed: readonly (readonly [string, string])[]): string | null {
  if (!value) return null;
  return allowed.some(([key]) => key === value) ? value : null;
}

function periodFromForm(form: FormData): { year: number; quarter: number } | null {
  const year = Number.parseInt(text(form, "year") ?? "", 10);
  const quarter = Number.parseInt(text(form, "quarter") ?? "", 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  if (quarter < 1 || quarter > 4) return null;
  return { year, quarter };
}

function checkMap(form: FormData, keys: readonly (readonly [string, string])[]): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  for (const [key] of keys) checks[key] = form.get(`check_${key}`) === "yes";
  return checks;
}

function dbError(error: { message: string } | null): string | null {
  if (!error) return null;
  if (/does not exist|schema cache/i.test(error.message)) {
    return "Compliance Logs tables are not in the database yet. Apply the compliance logs migration, then try again.";
  }
  if (/Finalized compliance records cannot be changed/i.test(error.message)) {
    return "This form is finalized. An admin must unlock it before it can be changed.";
  }
  if (/Completed QAPI project cannot be edited/i.test(error.message)) {
    return "This project is completed. Reopen it before making changes.";
  }
  return error.message;
}

type SigPrefix = "admin" | "clinical" | "completed";

function sigColumns(prefix: SigPrefix): { user: string; name: string; at: string } {
  if (prefix === "completed") {
    return {
      user: "completed_signed_by_user_id",
      name: "completed_signed_name",
      at: "completed_signed_at",
    };
  }
  return {
    user: `${prefix}_signed_by_user_id`,
    name: `${prefix}_signed_name`,
    at: `${prefix}_signed_at`,
  };
}

function applySignature(
  form: FormData,
  prefix: SigPrefix,
  staff: StaffProfile,
  existing: { name: string | null; at: string | null },
  opts: { finalize: boolean; required: boolean }
): { ok: true; patch: Record<string, string | null> } | { ok: false; error: string } {
  const cols = sigColumns(prefix);
  const typed = text(form, `${prefix}_signed_name`);
  const confirmed = form.get(`${prefix}_sign_confirm`) === "yes";
  const label =
    prefix === "clinical" ? "Clinical Director / RN" : prefix === "completed" ? "Completed By" : "Administrator";

  if (confirmed) {
    if (!typed) return { ok: false, error: `${label} signature needs a typed name.` };
    return {
      ok: true,
      patch: {
        [cols.user]: staff.user_id,
        [cols.name]: typed,
        [cols.at]: new Date().toISOString(),
      },
    };
  }

  if (typed && typed !== (existing.name ?? "")) {
    return { ok: false, error: `Check the box to confirm the ${label} signature.` };
  }
  if (opts.finalize && opts.required && !existing.at) {
    return { ok: false, error: `${label} signature is required to finalize.` };
  }
  return { ok: true, patch: {} };
}

function finalizePatch(staff: StaffProfile, finalize: boolean): Record<string, string | null> {
  if (!finalize) return { status: "draft" };
  return {
    status: "finalized",
    finalized_at: new Date().toISOString(),
    finalized_by: staff.user_id,
  };
}

async function writeChange(staff: StaffProfile, entityType: string, entityId: string, action: string, reason: string) {
  return supabaseAdmin.from("compliance_change_log").insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    reason,
    actor_user_id: staff.user_id,
    actor_name: staffDisplayName(staff),
  });
}

export async function searchCompliancePatients(query: string): Promise<{ id: string; name: string }[]> {
  const staff = await getStaffProfile();
  if (!staff || !canUseComplianceLogs(staff)) return [];
  const safe = query.replace(/[%_,.()]/g, " ").replace(/\s+/g, " ").trim();
  if (safe.length < 2) return [];
  const pattern = `%${safe}%`;
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("full_name, first_name, last_name, patients!inner(id, archived_at)")
    .or(`full_name.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`)
    .limit(12);
  if (error || !data) return [];

  const results: { id: string; name: string }[] = [];
  for (const row of data as Array<{
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    patients:
      | { id: string; archived_at: string | null }
      | { id: string; archived_at: string | null }[]
      | null;
  }>) {
    const patients = Array.isArray(row.patients) ? row.patients : row.patients ? [row.patients] : [];
    const patient = patients.find((item) => !item.archived_at);
    if (!patient) continue;
    const name =
      (row.full_name ?? "").trim() || [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    if (!name) continue;
    results.push({ id: patient.id, name });
  }
  return results;
}

export async function saveMeeting(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const period = periodFromForm(form);
    if (!period) return { ok: false, error: "Choose a year and quarter." };
    const meetingType = oneOf(text(form, "meeting_type"), MEETING_TYPES);
    if (!meetingType) return { ok: false, error: "Choose a meeting type." };
    const finalize = form.get("intent") === "finalize";
    const id = text(form, "id");

    let existing: {
      status: string;
      admin_signed_name: string | null;
      admin_signed_at: string | null;
      clinical_signed_name: string | null;
      clinical_signed_at: string | null;
    } | null = null;
    if (id) {
      const { data, error } = await supabaseAdmin
        .from("compliance_meetings")
        .select("status, admin_signed_name, admin_signed_at, clinical_signed_name, clinical_signed_at")
        .eq("id", id)
        .maybeSingle();
      const message = dbError(error);
      if (message) return { ok: false, error: message };
      if (!data) return { ok: false, error: "Meeting not found." };
      if (data.status === "finalized") {
        return { ok: false, error: "This meeting is finalized. An admin must unlock it before editing." };
      }
      existing = data;
    }

    const adminSig = applySignature(
      form,
      "admin",
      staff,
      { name: existing?.admin_signed_name ?? null, at: existing?.admin_signed_at ?? null },
      { finalize, required: true }
    );
    if (!adminSig.ok) return adminSig;
    const clinicalSig = applySignature(
      form,
      "clinical",
      staff,
      { name: existing?.clinical_signed_name ?? null, at: existing?.clinical_signed_at ?? null },
      { finalize, required: false }
    );
    if (!clinicalSig.ok) return clinicalSig;

    const payload = {
      year: period.year,
      quarter: period.quarter,
      meeting_type: meetingType,
      meeting_date: dateField(form, "meeting_date"),
      start_time: timeField(form, "start_time"),
      end_time: timeField(form, "end_time"),
      attendees: text(form, "attendees"),
      topics_discussed: text(form, "topics_discussed"),
      problems_identified: text(form, "problems_identified"),
      actions_decided: text(form, "actions_decided"),
      person_responsible: text(form, "person_responsible"),
      due_date: dateField(form, "due_date"),
      follow_up_prior: text(form, "follow_up_prior"),
      additional_notes: text(form, "additional_notes"),
      ...adminSig.patch,
      ...clinicalSig.patch,
      ...finalizePatch(staff, finalize),
    };

    if (finalize && !payload.meeting_date) {
      return { ok: false, error: "Meeting date is required to finalize." };
    }

    if (id) {
      const { error } = await supabaseAdmin.from("compliance_meetings").update(payload).eq("id", id);
      const message = dbError(error);
      if (message) return { ok: false, error: message };
      if (finalize) {
        await supabaseAdmin.from("compliance_na_marks").delete().match({
          year: period.year,
          quarter: period.quarter,
          item_key: "meetings",
        });
      }
      refresh();
      return { ok: true, id };
    }

    const { data, error } = await supabaseAdmin
      .from("compliance_meetings")
      .insert({ ...payload, created_by: staff.user_id })
      .select("id")
      .single();
    const message = dbError(error);
    if (message || !data) return { ok: false, error: message ?? "Could not save the meeting." };
    refresh();
    return { ok: true, id: data.id as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the meeting." };
  }
}

export async function deleteDraftMeeting(id: string): Promise<ActionResult> {
  try {
    await actor();
    const { data, error } = await supabaseAdmin.from("compliance_meetings").select("status").eq("id", id).maybeSingle();
    const message = dbError(error);
    if (message) return { ok: false, error: message };
    if (!data) return { ok: false, error: "Meeting not found." };
    if (data.status !== "draft") return { ok: false, error: "Only a draft can be deleted." };
    const removed = await supabaseAdmin.from("compliance_meetings").delete().eq("id", id).eq("status", "draft");
    const removeError = dbError(removed.error);
    if (removeError) return { ok: false, error: removeError };
    refresh();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete the draft." };
  }
}

export async function saveOnCall(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const ymd = dateField(form, "call_date");
    const time = text(form, "call_time");
    const occurred = ymd && time ? combineAppCalendarDateAndTimeToUtcIso(ymd, time) : null;
    if (!occurred) return { ok: false, error: "Date and time are required." };
    const patientName = text(form, "patient_name");
    const reason = text(form, "reason");
    const actionTaken = text(form, "action_taken");
    const handledBy = text(form, "handled_by_name");
    if (!patientName || !reason || !actionTaken || !handledBy) {
      return { ok: false, error: "Patient, reason, action taken, and handled by are required." };
    }
    const patientIdRaw = text(form, "patient_id");
    const patientId = patientIdRaw && /^[0-9a-f-]{36}$/i.test(patientIdRaw) ? patientIdRaw : null;
    const payload = {
      occurred_at: occurred,
      patient_id: patientId,
      patient_name: patientName,
      reason,
      action_taken: actionTaken,
      handled_by_name: handledBy,
      handled_by_user_id: handledBy === staffDisplayName(staff) ? staff.user_id : null,
      follow_up_needed: form.get("follow_up_needed") === "yes",
      follow_up_completed: form.get("follow_up_completed") === "yes",
      notes: text(form, "notes"),
    };
    const id = text(form, "id");
    if (id) {
      const { error } = await supabaseAdmin.from("compliance_on_call_logs").update(payload).eq("id", id);
      const message = dbError(error);
      if (message) return { ok: false, error: message };
      refresh();
      return { ok: true, id };
    }
    const { data, error } = await supabaseAdmin
      .from("compliance_on_call_logs")
      .insert({ ...payload, created_by: staff.user_id })
      .select("id")
      .single();
    const message = dbError(error);
    if (message || !data) return { ok: false, error: message ?? "Could not save the call." };
    refresh();
    return { ok: true, id: data.id as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the call." };
  }
}

export async function signNilOnCall(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const kind = text(form, "period_kind");
    const year = Number.parseInt(text(form, "year") ?? "", 10);
    const period = Number.parseInt(text(form, "period") ?? "", 10);
    if (kind !== "quarter" && kind !== "month") return { ok: false, error: "Choose a reporting period." };
    if (!Number.isFinite(year) || year < 2000 || year > 2100) return { ok: false, error: "Choose a year." };
    if (kind === "quarter" && (period < 1 || period > 4)) return { ok: false, error: "Choose a quarter." };
    if (kind === "month" && (period < 1 || period > 12)) return { ok: false, error: "Choose a month." };
    const name = text(form, "admin_signed_name");
    if (form.get("admin_sign_confirm") !== "yes" || !name) {
      return { ok: false, error: "Type your name and confirm the administrator signature." };
    }

    const range = kind === "quarter" ? quarterRangeIso(year, period) : monthRangeIso(year, period);
    const existingCalls = await supabaseAdmin
      .from("compliance_on_call_logs")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", range.start)
      .lt("occurred_at", range.end);
    if (existingCalls.error) return { ok: false, error: dbError(existingCalls.error) ?? existingCalls.error.message };
    if ((existingCalls.count ?? 0) > 0) {
      return { ok: false, error: "Calls were logged in this period, so a no-calls page cannot be signed." };
    }

    const { data, error } = await supabaseAdmin
      .from("compliance_on_call_attestations")
      .insert({
        period_kind: kind,
        year,
        quarter: kind === "quarter" ? period : null,
        month: kind === "month" ? period : null,
        statement: NIL_ON_CALL_STATEMENT,
        administrator_name: name,
        signed_by_user_id: staff.user_id,
        signed_name: name,
        signed_at: new Date().toISOString(),
        created_by: staff.user_id,
      })
      .select("id")
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return { ok: false, error: "A no-calls page is already signed for this period." };
      }
      return { ok: false, error: dbError(error) ?? error.message };
    }
    refresh();
    return { ok: true, id: data.id as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not sign the no-calls page." };
  }
}

export async function saveSafety(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const period = periodFromForm(form);
    if (!period) return { ok: false, error: "Choose a year and quarter." };
    const finalize = form.get("intent") === "finalize";
    const { data: existing, error: readError } = await supabaseAdmin
      .from("compliance_safety_checks")
      .select("id, status, completed_signed_name, completed_signed_at, admin_signed_name, admin_signed_at")
      .eq("year", period.year)
      .eq("quarter", period.quarter)
      .maybeSingle();
    const readMessage = dbError(readError);
    if (readMessage) return { ok: false, error: readMessage };
    if (existing?.status === "finalized") {
      return { ok: false, error: "This safety check is finalized. An admin must unlock it before editing." };
    }
    const completedSig = applySignature(
      form,
      "completed",
      staff,
      { name: existing?.completed_signed_name ?? null, at: existing?.completed_signed_at ?? null },
      { finalize, required: true }
    );
    if (!completedSig.ok) return completedSig;
    const adminSig = applySignature(
      form,
      "admin",
      staff,
      { name: existing?.admin_signed_name ?? null, at: existing?.admin_signed_at ?? null },
      { finalize, required: true }
    );
    if (!adminSig.ok) return adminSig;
    const payload = {
      year: period.year,
      quarter: period.quarter,
      inspection_date: dateField(form, "inspection_date"),
      completed_by_name: text(form, "completed_by_name"),
      checks: checkMap(form, SAFETY_ITEMS),
      problems_found: text(form, "problems_found"),
      corrective_action: text(form, "corrective_action"),
      date_corrected: dateField(form, "date_corrected"),
      corrected_by: text(form, "corrected_by"),
      ...completedSig.patch,
      ...adminSig.patch,
      ...finalizePatch(staff, finalize),
    };
    if (finalize && (!payload.inspection_date || !payload.completed_by_name)) {
      return { ok: false, error: "Inspection date and completed by are required to finalize." };
    }
    const write = existing
      ? await supabaseAdmin.from("compliance_safety_checks").update(payload).eq("id", existing.id).select("id").single()
      : await supabaseAdmin
          .from("compliance_safety_checks")
          .insert({ ...payload, created_by: staff.user_id })
          .select("id")
          .single();
    const message = dbError(write.error);
    if (message || !write.data) return { ok: false, error: message ?? "Could not save the safety check." };
    if (finalize) {
      await supabaseAdmin.from("compliance_na_marks").delete().match({
        year: period.year,
        quarter: period.quarter,
        item_key: "safety",
      });
    }
    refresh();
    return { ok: true, id: write.data.id as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the safety check." };
  }
}

export async function saveEmergencyReview(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const period = periodFromForm(form);
    if (!period) return { ok: false, error: "Choose a year and quarter." };
    const finalize = form.get("intent") === "finalize";
    const { data: existing, error: readError } = await supabaseAdmin
      .from("compliance_emergency_reviews")
      .select("id, status, admin_signed_name, admin_signed_at")
      .eq("year", period.year)
      .eq("quarter", period.quarter)
      .maybeSingle();
    const readMessage = dbError(readError);
    if (readMessage) return { ok: false, error: readMessage };
    if (existing?.status === "finalized") {
      return { ok: false, error: "This review is finalized. An admin must unlock it before editing." };
    }
    const adminSig = applySignature(
      form,
      "admin",
      staff,
      { name: existing?.admin_signed_name ?? null, at: existing?.admin_signed_at ?? null },
      { finalize, required: true }
    );
    if (!adminSig.ok) return adminSig;
    const changesRequired = form.get("changes_required") === "yes";
    const payload = {
      year: period.year,
      quarter: period.quarter,
      review_date: dateField(form, "review_date"),
      reviewed_by_name: text(form, "reviewed_by_name"),
      checks: checkMap(form, EMERGENCY_REVIEW_ITEMS),
      changes_required: changesRequired,
      changes_made: changesRequired ? text(form, "changes_made") : null,
      date_updated: changesRequired ? dateField(form, "date_updated") : null,
      updated_by_name: changesRequired ? text(form, "updated_by_name") : null,
      ...adminSig.patch,
      ...finalizePatch(staff, finalize),
    };
    if (finalize && (!payload.review_date || !payload.reviewed_by_name)) {
      return { ok: false, error: "Review date and reviewed by are required to finalize." };
    }
    if (finalize && changesRequired && !payload.changes_made) {
      return { ok: false, error: "Describe the changes that were made." };
    }
    const write = existing
      ? await supabaseAdmin.from("compliance_emergency_reviews").update(payload).eq("id", existing.id).select("id").single()
      : await supabaseAdmin
          .from("compliance_emergency_reviews")
          .insert({ ...payload, created_by: staff.user_id })
          .select("id")
          .single();
    const message = dbError(write.error);
    if (message || !write.data) return { ok: false, error: message ?? "Could not save the review." };
    if (finalize) {
      await supabaseAdmin.from("compliance_na_marks").delete().match({
        year: period.year,
        quarter: period.quarter,
        item_key: "emergency_review",
      });
    }
    refresh();
    return { ok: true, id: write.data.id as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the review." };
  }
}

export async function saveDrill(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const finalize = form.get("intent") === "finalize";
    const id = text(form, "id");
    const exerciseDate = dateField(form, "exercise_date");
    const fromDate = exerciseDate ? periodFromYmd(exerciseDate) : null;
    const fromForm = periodFromForm(form);
    const period = fromDate ?? fromForm;
    if (!period) return { ok: false, error: "Choose a year and quarter." };
    const exerciseType = oneOf(text(form, "exercise_type"), EXERCISE_TYPES);

    let existing: { status: string; admin_signed_name: string | null; admin_signed_at: string | null } | null = null;
    if (id) {
      const { data, error } = await supabaseAdmin
        .from("compliance_emergency_drills")
        .select("status, admin_signed_name, admin_signed_at")
        .eq("id", id)
        .maybeSingle();
      const message = dbError(error);
      if (message) return { ok: false, error: message };
      if (!data) return { ok: false, error: "Exercise not found." };
      if (data.status === "finalized") {
        return { ok: false, error: "This exercise is finalized. An admin must unlock it before editing." };
      }
      existing = data;
    }
    const adminSig = applySignature(
      form,
      "admin",
      staff,
      { name: existing?.admin_signed_name ?? null, at: existing?.admin_signed_at ?? null },
      { finalize, required: true }
    );
    if (!adminSig.ok) return adminSig;
    const planRaw = text(form, "plan_updated");
    const payload = {
      year: period.year,
      quarter: period.quarter,
      exercise_date: exerciseDate,
      exercise_type: exerciseType,
      scenario: text(form, "scenario"),
      participants: text(form, "participants"),
      what_happened: text(form, "what_happened"),
      what_worked: text(form, "what_worked"),
      what_did_not_work: text(form, "what_did_not_work"),
      problems_identified: text(form, "problems_identified"),
      corrective_action: text(form, "corrective_action"),
      person_responsible: text(form, "person_responsible"),
      corrective_due_date: dateField(form, "corrective_due_date"),
      plan_updated: planRaw === "yes" ? true : planRaw === "no" ? false : null,
      additional_notes: text(form, "additional_notes"),
      ...adminSig.patch,
      ...finalizePatch(staff, finalize),
    };
    if (finalize && (!exerciseDate || !exerciseType || payload.plan_updated == null)) {
      return { ok: false, error: "Exercise date, type, and whether the plan was updated are required to finalize." };
    }
    if (id) {
      const { error } = await supabaseAdmin.from("compliance_emergency_drills").update(payload).eq("id", id);
      const message = dbError(error);
      if (message) return { ok: false, error: message };
    } else {
      const { data, error } = await supabaseAdmin
        .from("compliance_emergency_drills")
        .insert({ ...payload, created_by: staff.user_id })
        .select("id")
        .single();
      const message = dbError(error);
      if (message || !data) return { ok: false, error: message ?? "Could not save the exercise." };
      if (finalize) {
        await supabaseAdmin.from("compliance_na_marks").delete().match({
          year: period.year,
          quarter: period.quarter,
          item_key: "drill",
        });
      }
      refresh();
      return { ok: true, id: data.id as string };
    }
    if (finalize) {
      await supabaseAdmin.from("compliance_na_marks").delete().match({
        year: period.year,
        quarter: period.quarter,
        item_key: "drill",
      });
    }
    refresh();
    return { ok: true, id: id ?? undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the exercise." };
  }
}

export async function deleteDraftDrill(id: string): Promise<ActionResult> {
  try {
    await actor();
    const { data, error } = await supabaseAdmin
      .from("compliance_emergency_drills")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    const message = dbError(error);
    if (message) return { ok: false, error: message };
    if (!data) return { ok: false, error: "Exercise not found." };
    if (data.status !== "draft") return { ok: false, error: "Only a draft can be deleted." };
    const removed = await supabaseAdmin.from("compliance_emergency_drills").delete().eq("id", id).eq("status", "draft");
    const removeError = dbError(removed.error);
    if (removeError) return { ok: false, error: removeError };
    refresh();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete the draft." };
  }
}

export async function saveQapiReview(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const period = periodFromForm(form);
    if (!period) return { ok: false, error: "Choose a year and quarter." };
    const finalize = form.get("intent") === "finalize";
    const numbers: Record<string, number | null> = {};
    for (const [key, label] of QAPI_COUNT_FIELDS) {
      const raw = text(form, key);
      if (!raw) {
        numbers[key] = null;
        continue;
      }
      if (!/^\d+$/.test(raw) || Number(raw) > 100000) {
        return { ok: false, error: `${label} must be a whole number.` };
      }
      numbers[key] = Number(raw);
    }
    const effective = text(form, "previous_action_effective");
    if (effective && !["yes", "no", "not_applicable"].includes(effective)) {
      return { ok: false, error: "Choose whether the previous corrective action was effective." };
    }
    const { data: existing, error: readError } = await supabaseAdmin
      .from("compliance_qapi_reviews")
      .select("id, status, admin_signed_name, admin_signed_at, clinical_signed_name, clinical_signed_at")
      .eq("year", period.year)
      .eq("quarter", period.quarter)
      .maybeSingle();
    const readMessage = dbError(readError);
    if (readMessage) return { ok: false, error: readMessage };
    if (existing?.status === "finalized") {
      return { ok: false, error: "This QAPI review is finalized. An admin must unlock it before editing." };
    }
    const adminSig = applySignature(
      form,
      "admin",
      staff,
      { name: existing?.admin_signed_name ?? null, at: existing?.admin_signed_at ?? null },
      { finalize, required: true }
    );
    if (!adminSig.ok) return adminSig;
    const clinicalSig = applySignature(
      form,
      "clinical",
      staff,
      { name: existing?.clinical_signed_name ?? null, at: existing?.clinical_signed_at ?? null },
      { finalize, required: false }
    );
    if (!clinicalSig.ok) return clinicalSig;
    const live = await qapiLiveCounts(period.year, period.quarter);
    const overridden = AUTO_KEYS.some((key) => numbers[key] !== live[key]);
    const payload = {
      year: period.year,
      quarter: period.quarter,
      review_date: dateField(form, "review_date"),
      reviewed_by_name: text(form, "reviewed_by_name"),
      ...numbers,
      counts_overridden: overridden,
      trends: text(form, "trends"),
      action_plan: text(form, "action_plan"),
      previous_action_effective: effective,
      additional_notes: text(form, "additional_notes"),
      ...adminSig.patch,
      ...clinicalSig.patch,
      ...finalizePatch(staff, finalize),
    };
    if (finalize && (!payload.review_date || !payload.reviewed_by_name || !effective)) {
      return { ok: false, error: "Review date, reviewed by, and the previous-action answer are required to finalize." };
    }
    const write = existing
      ? await supabaseAdmin.from("compliance_qapi_reviews").update(payload).eq("id", existing.id).select("id").single()
      : await supabaseAdmin
          .from("compliance_qapi_reviews")
          .insert({ ...payload, created_by: staff.user_id })
          .select("id")
          .single();
    const message = dbError(write.error);
    if (message || !write.data) return { ok: false, error: message ?? "Could not save the QAPI review." };
    if (finalize) {
      await supabaseAdmin.from("compliance_na_marks").delete().match({
        year: period.year,
        quarter: period.quarter,
        item_key: "qapi_review",
      });
    }
    refresh();
    return { ok: true, id: write.data.id as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the QAPI review." };
  }
}

export async function saveQapiProject(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const name = text(form, "project_name");
    if (!name) return { ok: false, error: "Project name is required." };
    const status = oneOf(text(form, "status"), PROJECT_STATUSES) ?? "planning";
    const goalMet = text(form, "goal_met");
    if (goalMet && !["yes", "no", "partially"].includes(goalMet)) {
      return { ok: false, error: "Choose whether the goal was met." };
    }
    const id = text(form, "id");
    const payload = {
      project_name: name,
      problem_identified: text(form, "problem_identified"),
      reason_selected: text(form, "reason_selected"),
      baseline: text(form, "baseline"),
      goal: text(form, "goal"),
      action_intervention: text(form, "action_intervention"),
      responsible_person: text(form, "responsible_person"),
      start_date: dateField(form, "start_date"),
      target_date: dateField(form, "target_date"),
      current_results: text(form, "current_results"),
      status,
      outcome: text(form, "outcome"),
      goal_met: goalMet,
      follow_up_needed: text(form, "follow_up_needed"),
      completed_at: status === "completed" ? new Date().toISOString() : null,
    };
    if (id) {
      const { data: existing, error: readError } = await supabaseAdmin
        .from("compliance_qapi_projects")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      const readMessage = dbError(readError);
      if (readMessage) return { ok: false, error: readMessage };
      if (!existing) return { ok: false, error: "Project not found." };
      if (existing.status === "completed") {
        return { ok: false, error: "This project is completed. Reopen it before making changes." };
      }
      const { error } = await supabaseAdmin.from("compliance_qapi_projects").update(payload).eq("id", id);
      const message = dbError(error);
      if (message) return { ok: false, error: message };
      refresh();
      return { ok: true, id };
    }
    const { data, error } = await supabaseAdmin
      .from("compliance_qapi_projects")
      .insert({ ...payload, created_by: staff.user_id })
      .select("id")
      .single();
    const message = dbError(error);
    if (message || !data) return { ok: false, error: message ?? "Could not save the project." };
    refresh();
    return { ok: true, id: data.id as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the project." };
  }
}

export async function addQapiProjectUpdate(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const projectId = text(form, "project_id");
    const updateText = text(form, "update_text");
    const updateDate = dateField(form, "update_date");
    if (!projectId || !updateText || !updateDate) {
      return { ok: false, error: "Date and update are required." };
    }
    const { data: project, error: readError } = await supabaseAdmin
      .from("compliance_qapi_projects")
      .select("status")
      .eq("id", projectId)
      .maybeSingle();
    const readMessage = dbError(readError);
    if (readMessage) return { ok: false, error: readMessage };
    if (!project) return { ok: false, error: "Project not found." };
    if (project.status === "completed") {
      return { ok: false, error: "Reopen the project before adding an update." };
    }
    const result = text(form, "result");
    const { error } = await supabaseAdmin.from("compliance_qapi_project_updates").insert({
      project_id: projectId,
      update_date: updateDate,
      update_text: updateText,
      result,
      entered_by_user_id: staff.user_id,
      entered_by_name: staffDisplayName(staff),
    });
    const message = dbError(error);
    if (message) return { ok: false, error: message };
    if (result) {
      await supabaseAdmin.from("compliance_qapi_projects").update({ current_results: result }).eq("id", projectId);
    }
    refresh();
    return { ok: true, id: projectId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not add the update." };
  }
}

export async function completeQapiProject(id: string): Promise<ActionResult> {
  try {
    const staff = await actor();
    const { data, error } = await supabaseAdmin
      .from("compliance_qapi_projects")
      .select("status, project_name")
      .eq("id", id)
      .maybeSingle();
    const message = dbError(error);
    if (message) return { ok: false, error: message };
    if (!data) return { ok: false, error: "Project not found." };
    if (data.status === "completed") return { ok: true, id };
    const write = await supabaseAdmin
      .from("compliance_qapi_projects")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id);
    const writeError = dbError(write.error);
    if (writeError) return { ok: false, error: writeError };
    await writeChange(staff, "qapi_project", id, "complete", `Completed project ${data.project_name ?? ""}`.trim());
    refresh();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not complete the project." };
  }
}

export async function reopenQapiProject(id: string): Promise<ActionResult> {
  try {
    const staff = await actor();
    if (!canUnlockCompliance(staff)) return { ok: false, error: "Only an admin can reopen a completed project." };
    const { error } = await supabaseAdmin
      .from("compliance_qapi_projects")
      .update({ status: "monitoring", completed_at: null })
      .eq("id", id)
      .eq("status", "completed");
    const message = dbError(error);
    if (message) return { ok: false, error: message };
    await writeChange(staff, "qapi_project", id, "reopen", "Reopened completed project.");
    refresh();
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reopen the project." };
  }
}

export async function saveIncident(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const occurred = dateField(form, "occurred_on");
    const incidentType = oneOf(text(form, "incident_type"), INCIDENT_TYPES);
    const description = text(form, "description");
    const handledBy = text(form, "handled_by_name");
    if (!occurred || !incidentType || !description || !handledBy) {
      return { ok: false, error: "Date, type, short description, and handled by are required." };
    }
    const patientIdRaw = text(form, "patient_id");
    const payload = {
      occurred_on: occurred,
      patient_id: patientIdRaw && /^[0-9a-f-]{36}$/i.test(patientIdRaw) ? patientIdRaw : null,
      patient_name: text(form, "patient_name"),
      incident_type: incidentType,
      description,
      action_taken: text(form, "action_taken"),
      handled_by_name: handledBy,
      handled_by_user_id: handledBy === staffDisplayName(staff) ? staff.user_id : null,
      follow_up_needed: form.get("follow_up_needed") === "yes",
      resolved: form.get("resolved") === "yes",
      resolution_date: dateField(form, "resolution_date"),
      notes: text(form, "notes"),
    };
    const id = text(form, "id");
    if (id) {
      const { error } = await supabaseAdmin.from("compliance_incident_logs").update(payload).eq("id", id);
      const message = dbError(error);
      if (message) return { ok: false, error: message };
      refresh();
      return { ok: true, id };
    }
    const { data, error } = await supabaseAdmin
      .from("compliance_incident_logs")
      .insert({ ...payload, created_by: staff.user_id })
      .select("id")
      .single();
    const message = dbError(error);
    if (message || !data) return { ok: false, error: message ?? "Could not save the entry." };
    refresh();
    return { ok: true, id: data.id as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the entry." };
  }
}

const UNLOCK_TABLES = {
  meeting: "compliance_meetings",
  safety: "compliance_safety_checks",
  emergency_review: "compliance_emergency_reviews",
  drill: "compliance_emergency_drills",
  qapi_review: "compliance_qapi_reviews",
} as const;

export async function unlockComplianceRecord(
  entity: keyof typeof UNLOCK_TABLES,
  id: string,
  reason: string
): Promise<ActionResult> {
  try {
    const staff = await actor();
    if (!canUnlockCompliance(staff)) {
      return { ok: false, error: "Only an admin can unlock a finalized form." };
    }
    const note = reason.trim();
    if (note.length < 3) return { ok: false, error: "Enter a short reason for the unlock." };
    const table = UNLOCK_TABLES[entity];
    const { error } = await supabaseAdmin
      .from(table)
      .update({ status: "draft", finalized_at: null, finalized_by: null })
      .eq("id", id)
      .eq("status", "finalized");
    const message = dbError(error);
    if (message) return { ok: false, error: message };
    const log = await writeChange(staff, entity, id, "unlock", note);
    refresh();
    if (log.error) {
      return { ok: true, id, message: "Unlocked, but the audit note did not save. Keep the reason with your records." };
    }
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not unlock the form." };
  }
}

export async function markNotApplicable(form: FormData): Promise<ActionResult> {
  try {
    const staff = await actor();
    const period = periodFromForm(form);
    const item = text(form, "item_key") as NaItemKey | null;
    const reason = text(form, "reason");
    if (!period || !item || !NA_KEYS.has(item)) return { ok: false, error: "Choose the item that does not apply." };
    if (!reason) return { ok: false, error: "Add a short reason." };
    const { error } = await supabaseAdmin.from("compliance_na_marks").upsert(
      {
        year: period.year,
        quarter: period.quarter,
        item_key: item,
        reason,
        marked_by: staff.user_id,
        marked_at: new Date().toISOString(),
      },
      { onConflict: "year,quarter,item_key" }
    );
    const message = dbError(error);
    if (message) return { ok: false, error: message };
    refresh();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not mark this item." };
  }
}
