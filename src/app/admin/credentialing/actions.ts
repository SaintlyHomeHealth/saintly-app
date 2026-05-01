"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PAYER_CREDENTIALING_ACTIVITY_TYPES } from "@/lib/crm/credentialing-activity-types";
import {
  isPayerCredentialingDocStatus,
  PAYER_CREDENTIALING_DOC_LABELS,
  type PayerCredentialingDocType,
} from "@/lib/crm/credentialing-documents";
import {
  buildStoredDenialReason,
  CREDENTIALING_DENIED_REAPPLY_DAYS,
  CREDENTIALING_NEXT_ACTION_REAPPLY,
} from "@/lib/crm/credentialing-denial";
import {
  isContractingStatus,
  isCredentialingPriority,
  isCredentialingStatus,
} from "@/lib/crm/credentialing-status-options";
import { contractingStatusLabel, credentialingStatusLabel } from "@/lib/crm/credentialing-command-center";
import {
  isAllowedPayerCredentialingMime,
  PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES,
  PAYER_CREDENTIALING_STORAGE_BUCKET,
  sanitizePayerCredentialingFileName,
} from "@/lib/crm/payer-credentialing-storage";
import { supabaseAdmin } from "@/lib/admin";
import { PAYER_RECORD_SELECT_FULL } from "@/lib/crm/payer-credentialing-record-select";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readTrimmed(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

type PayerRecordRow = {
  id: string;
  payer_name: string | null;
  payer_type: string | null;
  market_state: string | null;
  credentialing_status: string | null;
  contracting_status: string | null;
  portal_url: string | null;
  portal_username_hint: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_phone_direct: string | null;
  primary_contact_fax: string | null;
  primary_contact_email: string | null;
  primary_contact_title: string | null;
  primary_contact_department: string | null;
  primary_contact_website: string | null;
  primary_contact_notes: string | null;
  primary_contact_last_contacted_at: string | null;
  primary_contact_preferred_method: string | null;
  primary_contact_status: string | null;
  notes: string | null;
  last_follow_up_at: string | null;
  assigned_owner_user_id: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
  priority: string | null;
  denial_reason: string | null;
};

/** Keeps payer_credentialing_record_emails primary row in sync when the legacy single email field changes. */
async function syncPrimaryEmailRowForRecord(recordId: string, primaryEmail: string | null) {
  const email = primaryEmail?.trim() ?? "";
  const { data: existing } = await supabaseAdmin
    .from("payer_credentialing_record_emails")
    .select("id")
    .eq("credentialing_record_id", recordId)
    .eq("is_primary", true)
    .maybeSingle();

  if (!email) {
    if (existing?.id) {
      await supabaseAdmin.from("payer_credentialing_record_emails").delete().eq("id", existing.id);
    }
    return;
  }

  if (existing?.id) {
    await supabaseAdmin.from("payer_credentialing_record_emails").update({ email }).eq("id", existing.id);
  } else {
    await supabaseAdmin.from("payer_credentialing_record_emails").insert({
      credentialing_record_id: recordId,
      email,
      is_primary: true,
      sort_order: 0,
    });
  }
}

async function insertCredentialingActivity(params: {
  credentialingRecordId: string;
  activityType: string;
  summary: string;
  details?: string | null;
  createdByUserId: string | null;
}) {
  const { error } = await supabaseAdmin.from("payer_credentialing_activity").insert({
    credentialing_record_id: params.credentialingRecordId,
    activity_type: params.activityType,
    summary: params.summary,
    details: params.details ?? null,
    created_by_user_id: params.createdByUserId,
  });
  if (error) {
    console.warn("[credentialing] activity insert:", error.message);
  }
}

function credentialingDueDatePlusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function readOwnerId(formData: FormData): string | null {
  const raw = readTrimmed(formData, "assigned_owner_user_id");
  if (!raw) return null;
  return UUID_RE.test(raw) ? raw : null;
}

export async function createPayerCredentialingRecord(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false as const, error: "forbidden" };
  }

  const payer_name = readTrimmed(formData, "payer_name");
  if (!payer_name) {
    return { ok: false as const, error: "name_required" };
  }

  const cred = readTrimmed(formData, "credentialing_status") ?? "in_progress";
  const cont = readTrimmed(formData, "contracting_status") ?? "pending";
  if (!isCredentialingStatus(cred) || !isContractingStatus(cont)) {
    return { ok: false as const, error: "invalid_status" };
  }

  const ownerId = readOwnerId(formData);
  const pr = readTrimmed(formData, "priority");
  const priority = pr && isCredentialingPriority(pr) ? pr : "medium";

  const { data, error } = await supabaseAdmin
    .from("payer_credentialing_records")
    .insert({
      payer_name,
      payer_type: readTrimmed(formData, "payer_type"),
      market_state: readTrimmed(formData, "market_state"),
      credentialing_status: cred,
      contracting_status: cont,
      portal_url: readTrimmed(formData, "portal_url"),
      portal_username_hint: readTrimmed(formData, "portal_username_hint"),
      primary_contact_name: readTrimmed(formData, "primary_contact_name"),
      primary_contact_phone: readTrimmed(formData, "primary_contact_phone"),
      primary_contact_email: readTrimmed(formData, "primary_contact_email"),
      notes: readTrimmed(formData, "notes"),
      assigned_owner_user_id: ownerId,
      next_action: readTrimmed(formData, "next_action"),
      next_action_due_date: readTrimmed(formData, "next_action_due_date"),
      priority,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.warn("[credentialing] create:", error?.message);
    return { ok: false as const, error: "insert_failed" };
  }

  const id = String(data.id);
  const initialEmail = readTrimmed(formData, "primary_contact_email");
  if (initialEmail) {
    const { error: emErr } = await supabaseAdmin.from("payer_credentialing_record_emails").insert({
      credentialing_record_id: id,
      email: initialEmail,
      is_primary: true,
      sort_order: 0,
    });
    if (emErr) {
      console.warn("[credentialing] create primary email row:", emErr.message);
    }
  }
  await insertCredentialingActivity({
    credentialingRecordId: id,
    activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.record_created,
    summary: `Payer record created: ${payer_name}`,
    details: null,
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${id}`);
  return { ok: true as const, id };
}

export async function submitNewPayerCredentialingForm(formData: FormData) {
  const res = await createPayerCredentialingRecord(formData);
  if (!res.ok) {
    redirect(`/admin/credentialing/new?error=${res.error}`);
  }
  redirect(`/admin/credentialing/${res.id}`);
}

function strEq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

export async function updatePayerCredentialingRecord(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const id = readTrimmed(formData, "id");
  if (!id) return;

  const { data: oldRow, error: fetchErr } = await supabaseAdmin
    .from("payer_credentialing_records")
    .select(PAYER_RECORD_SELECT_FULL)
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !oldRow) {
    console.warn("[credentialing] update fetch:", fetchErr?.message);
    return;
  }

  const old = oldRow as PayerRecordRow;

  const cred = readTrimmed(formData, "credentialing_status");
  const cont = readTrimmed(formData, "contracting_status");
  if (cred && !isCredentialingStatus(cred)) return;
  if (cont && !isContractingStatus(cont)) return;

  const ownerFieldPresent = formData.has("assigned_owner_user_id");
  const newOwner = ownerFieldPresent ? readOwnerId(formData) : undefined;

  const prefRaw = readTrimmed(formData, "primary_contact_preferred_method");
  const prefOk =
    prefRaw === "phone" || prefRaw === "email" || prefRaw === "fax" ? prefRaw : null;
  const stRaw = readTrimmed(formData, "primary_contact_status");
  const statusOk = stRaw === "active" || stRaw === "inactive" ? stRaw : "active";

  const lastContactRaw = readTrimmed(formData, "primary_contact_last_contacted_at");
  let lastContactIso: string | null = null;
  if (lastContactRaw && /^\d{4}-\d{2}-\d{2}$/.test(lastContactRaw)) {
    lastContactIso = `${lastContactRaw}T12:00:00.000Z`;
  }

  const payload: Record<string, unknown> = {
    payer_name: readTrimmed(formData, "payer_name"),
    payer_type: readTrimmed(formData, "payer_type"),
    market_state: readTrimmed(formData, "market_state"),
    portal_url: readTrimmed(formData, "portal_url"),
    portal_username_hint: readTrimmed(formData, "portal_username_hint"),
    primary_contact_name: readTrimmed(formData, "primary_contact_name"),
    primary_contact_phone: readTrimmed(formData, "primary_contact_phone"),
    primary_contact_phone_direct: readTrimmed(formData, "primary_contact_phone_direct"),
    primary_contact_fax: readTrimmed(formData, "primary_contact_fax"),
    primary_contact_email: readTrimmed(formData, "primary_contact_email"),
    primary_contact_title: readTrimmed(formData, "primary_contact_title"),
    primary_contact_department: readTrimmed(formData, "primary_contact_department"),
    primary_contact_website: readTrimmed(formData, "primary_contact_website"),
    primary_contact_notes: readTrimmed(formData, "primary_contact_notes"),
    primary_contact_last_contacted_at: lastContactIso,
    primary_contact_preferred_method: prefOk,
    primary_contact_status: statusOk,
    notes: readTrimmed(formData, "notes"),
    next_action: readTrimmed(formData, "next_action"),
    next_action_due_date: readTrimmed(formData, "next_action_due_date"),
  };

  const prForm = readTrimmed(formData, "priority");
  if (prForm && isCredentialingPriority(prForm)) {
    payload.priority = prForm;
  }
  if (cred) payload.credentialing_status = cred;
  if (cont) payload.contracting_status = cont;

  if (cred && cred !== "denied" && (old.credentialing_status ?? "").trim() === "denied") {
    payload.denial_reason = null;
  }

  if (ownerFieldPresent) {
    payload.assigned_owner_user_id = newOwner ?? null;
  }

  const markFollowUp = formData.get("mark_follow_up_now") === "1";
  if (markFollowUp) {
    payload.last_follow_up_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin.from("payer_credentialing_records").update(payload).eq("id", id);
  if (error) {
    console.warn("[credentialing] update:", error.message);
    return;
  }

  await syncPrimaryEmailRowForRecord(id, readTrimmed(formData, "primary_contact_email"));

  const nu = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const newCred = cred ?? nu(old.credentialing_status);
  const newCont = cont ?? nu(old.contracting_status);

  if (cred && !strEq(old.credentialing_status, newCred)) {
    await insertCredentialingActivity({
      credentialingRecordId: id,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.status_change,
      summary: `Credentialing: ${credentialingStatusLabel(nu(old.credentialing_status))} → ${credentialingStatusLabel(newCred)}`,
      details: null,
      createdByUserId: staff.user_id,
    });
  }
  if (cont && !strEq(old.contracting_status, newCont)) {
    await insertCredentialingActivity({
      credentialingRecordId: id,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.status_change,
      summary: `Contracting: ${contractingStatusLabel(nu(old.contracting_status))} → ${contractingStatusLabel(newCont)}`,
      details: null,
      createdByUserId: staff.user_id,
    });
  }

  if (ownerFieldPresent) {
    const prevOwner = old.assigned_owner_user_id;
    if ((prevOwner ?? "") !== (newOwner ?? "")) {
      await insertCredentialingActivity({
        credentialingRecordId: id,
        activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.owner_change,
        summary: newOwner ? "Owner assigned or changed" : "Owner unassigned",
        details: `Previous: ${prevOwner ?? "—"}\nNow: ${newOwner ?? "—"}`,
        createdByUserId: staff.user_id,
      });
    }
  }

  if (markFollowUp) {
    await insertCredentialingActivity({
      credentialingRecordId: id,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.follow_up,
      summary: "Follow-up logged (timestamp updated)",
      details: null,
      createdByUserId: staff.user_id,
    });
  }

  const newNotes = readTrimmed(formData, "notes");
  if (!strEq(old.notes, newNotes ?? "")) {
    const excerpt = (newNotes ?? "").slice(0, 500);
    await insertCredentialingActivity({
      credentialingRecordId: id,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.notes_updated,
      summary: "Notes field updated",
      details: excerpt || "(cleared)",
      createdByUserId: staff.user_id,
    });
  }

  const fieldLines: string[] = [];
  if (!strEq(old.payer_name, readTrimmed(formData, "payer_name") ?? "")) {
    fieldLines.push(`Payer name updated`);
  }
  if (!strEq(old.payer_type, readTrimmed(formData, "payer_type") ?? "")) {
    fieldLines.push(`Payer type updated`);
  }
  if (!strEq(old.market_state, readTrimmed(formData, "market_state") ?? "")) {
    fieldLines.push(`Market / state updated`);
  }
  if (!strEq(old.portal_url, readTrimmed(formData, "portal_url") ?? "")) {
    fieldLines.push(`Portal URL updated`);
  }
  if (!strEq(old.portal_username_hint, readTrimmed(formData, "portal_username_hint") ?? "")) {
    fieldLines.push(`Portal username hint updated`);
  }
  if (!strEq(old.primary_contact_name, readTrimmed(formData, "primary_contact_name") ?? "")) {
    fieldLines.push(`Primary contact name updated`);
  }
  if (!strEq(old.primary_contact_phone, readTrimmed(formData, "primary_contact_phone") ?? "")) {
    fieldLines.push(`Primary contact phone updated`);
  }
  if (!strEq(old.primary_contact_email, readTrimmed(formData, "primary_contact_email") ?? "")) {
    fieldLines.push(`Primary contact email updated`);
  }
  if (!strEq(old.next_action, readTrimmed(formData, "next_action") ?? "")) {
    fieldLines.push(`Next action updated`);
  }
  if (!strEq(old.next_action_due_date, readTrimmed(formData, "next_action_due_date") ?? "")) {
    fieldLines.push(`Next action due date updated`);
  }
  if (!strEq(old.priority ?? "medium", readTrimmed(formData, "priority") ?? "medium")) {
    fieldLines.push(`Priority updated`);
  }
  if (fieldLines.length > 0) {
    await insertCredentialingActivity({
      credentialingRecordId: id,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.record_updated,
      summary: "Record details updated",
      details: fieldLines.join("\n"),
      createdByUserId: staff.user_id,
    });
  }

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${id}`);
}

/**
 * Partial update for header, pipeline, and quick actions. Only fields present in `FormData` are applied
 * (unlike `updatePayerCredentialingRecord`, which expects the full edit form).
 */
export async function patchPayerCredentialingRecord(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const id = readTrimmed(formData, "id");
  if (!id) return;

  const { data: oldRow, error: fetchErr } = await supabaseAdmin
    .from("payer_credentialing_records")
    .select(PAYER_RECORD_SELECT_FULL)
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !oldRow) {
    console.warn("[credentialing] patch fetch:", fetchErr?.message);
    return;
  }

  const old = oldRow as PayerRecordRow;
  const payload: Record<string, unknown> = {};

  if (formData.has("credentialing_status")) {
    const cred = readTrimmed(formData, "credentialing_status");
    if (cred && !isCredentialingStatus(cred)) return;
    if (cred) payload.credentialing_status = cred;
  }
  if (formData.has("contracting_status")) {
    const cont = readTrimmed(formData, "contracting_status");
    if (cont && !isContractingStatus(cont)) return;
    if (cont) payload.contracting_status = cont;
  }
  if (formData.has("priority")) {
    const pr = readTrimmed(formData, "priority");
    if (pr && isCredentialingPriority(pr)) {
      payload.priority = pr;
    }
  }
  if (formData.has("next_action")) {
    payload.next_action = readTrimmed(formData, "next_action");
  }
  if (formData.has("next_action_due_date")) {
    payload.next_action_due_date = readTrimmed(formData, "next_action_due_date");
  }
  if (formData.has("assigned_owner_user_id")) {
    payload.assigned_owner_user_id = readOwnerId(formData);
  }

  if (payload.credentialing_status != null) {
    const nc = String(payload.credentialing_status).trim();
    if ((old.credentialing_status ?? "").trim() === "denied" && nc !== "denied") {
      payload.denial_reason = null;
    }
  }

  const markFollowUp = formData.get("mark_follow_up_now") === "1";
  if (markFollowUp) {
    payload.last_follow_up_at = new Date().toISOString();
  }

  if (Object.keys(payload).length === 0 && !markFollowUp) {
    return;
  }

  const { error } = await supabaseAdmin.from("payer_credentialing_records").update(payload).eq("id", id);
  if (error) {
    console.warn("[credentialing] patch:", error.message);
    return;
  }

  const nu = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const newCred = payload.credentialing_status != null ? nu(payload.credentialing_status) : nu(old.credentialing_status);
  const newCont = payload.contracting_status != null ? nu(payload.contracting_status) : nu(old.contracting_status);

  if (payload.credentialing_status != null && !strEq(old.credentialing_status, newCred)) {
    await insertCredentialingActivity({
      credentialingRecordId: id,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.status_change,
      summary: `Credentialing: ${credentialingStatusLabel(nu(old.credentialing_status))} → ${credentialingStatusLabel(newCred)}`,
      details: null,
      createdByUserId: staff.user_id,
    });
  }
  if (payload.contracting_status != null && !strEq(old.contracting_status, newCont)) {
    await insertCredentialingActivity({
      credentialingRecordId: id,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.status_change,
      summary: `Contracting: ${contractingStatusLabel(nu(old.contracting_status))} → ${contractingStatusLabel(newCont)}`,
      details: null,
      createdByUserId: staff.user_id,
    });
  }

  if (formData.has("assigned_owner_user_id")) {
    const newOwner = readOwnerId(formData);
    const prevOwner = old.assigned_owner_user_id;
    if ((prevOwner ?? "") !== (newOwner ?? "")) {
      await insertCredentialingActivity({
        credentialingRecordId: id,
        activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.owner_change,
        summary: newOwner ? "Owner assigned or changed" : "Owner unassigned",
        details: `Previous: ${prevOwner ?? "—"}\nNow: ${newOwner ?? "—"}`,
        createdByUserId: staff.user_id,
      });
    }
  }

  if (markFollowUp) {
    await insertCredentialingActivity({
      credentialingRecordId: id,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.follow_up,
      summary: "Follow-up logged (timestamp updated)",
      details: null,
      createdByUserId: staff.user_id,
    });
  }

  const fieldLines: string[] = [];
  if (payload.next_action != null && !strEq(old.next_action, readTrimmed(formData, "next_action") ?? "")) {
    fieldLines.push("Next action updated");
  }
  if (
    payload.next_action_due_date != null &&
    !strEq(old.next_action_due_date, readTrimmed(formData, "next_action_due_date") ?? "")
  ) {
    fieldLines.push("Next action due date updated");
  }
  if (
    payload.priority != null &&
    !strEq(old.priority ?? "medium", readTrimmed(formData, "priority") ?? "medium")
  ) {
    fieldLines.push("Priority updated");
  }
  if (fieldLines.length > 0) {
    await insertCredentialingActivity({
      credentialingRecordId: id,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.record_updated,
      summary: "Record details updated",
      details: fieldLines.join("\n"),
      createdByUserId: staff.user_id,
    });
  }

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${id}`);
}

export async function appendCredentialingActivityNote(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const id = readTrimmed(formData, "credentialing_id");
  const body = readTrimmed(formData, "activity_note");
  if (!id || !body) return;

  await insertCredentialingActivity({
    credentialingRecordId: id,
    activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.manual_note,
    summary: "Note",
    details: body,
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${id}`);
}

/** Sets credentialing to denied, optional reason, and schedules reapply follow-up (+90 days by default). */
export async function markPayerCredentialingDenied(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const id = readTrimmed(formData, "credentialing_id");
  if (!id) return;

  const category = readTrimmed(formData, "denial_reason_category");
  const other = readTrimmed(formData, "denial_reason_other");
  const storedReason = buildStoredDenialReason(category, other);

  const due = credentialingDueDatePlusDays(CREDENTIALING_DENIED_REAPPLY_DAYS);

  const { error } = await supabaseAdmin
    .from("payer_credentialing_records")
    .update({
      credentialing_status: "denied",
      contracting_status: "pending",
      denial_reason: storedReason,
      next_action: CREDENTIALING_NEXT_ACTION_REAPPLY,
      next_action_due_date: due,
    })
    .eq("id", id);

  if (error) {
    console.warn("[credentialing] mark denied:", error.message);
    return;
  }

  const detailsLines: string[] = [];
  if (storedReason) detailsLines.push(`Reason: ${storedReason}`);
  detailsLines.push(`Reapply follow-up due: ${due}`);

  await insertCredentialingActivity({
    credentialingRecordId: id,
    activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.status_change,
    summary: "Marked as denied",
    details: detailsLines.join("\n"),
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${id}`);
}

/** Clears denial and returns the file to active work (in progress). */
export async function reapplyPayerCredentialing(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const id = readTrimmed(formData, "credentialing_id");
  if (!id) return;

  const { data: cur, error: loadErr } = await supabaseAdmin
    .from("payer_credentialing_records")
    .select("credentialing_status")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !cur || (cur as { credentialing_status: string | null }).credentialing_status !== "denied") {
    if (loadErr) console.warn("[credentialing] reapply load:", loadErr.message);
    return;
  }

  const { error } = await supabaseAdmin
    .from("payer_credentialing_records")
    .update({
      credentialing_status: "in_progress",
      contracting_status: "pending",
      denial_reason: null,
    })
    .eq("id", id);

  if (error) {
    console.warn("[credentialing] reapply:", error.message);
    return;
  }

  await insertCredentialingActivity({
    credentialingRecordId: id,
    activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.status_change,
    summary: "Reapplication started",
    details: "Credentialing set to In progress; denial reason cleared.",
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${id}`);
}

export async function updatePayerCredentialingDocuments(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const credentialingId = readTrimmed(formData, "credentialing_id");
  if (!credentialingId) return;

  const { data: docs, error: docErr } = await supabaseAdmin
    .from("payer_credentialing_documents")
    .select("id, doc_type, status, uploaded_at")
    .eq("credentialing_record_id", credentialingId);

  if (docErr || !docs?.length) {
    console.warn("[credentialing] documents load:", docErr?.message);
    return;
  }

  const now = new Date().toISOString();

  for (const doc of docs) {
    const docId = String(doc.id);
    const statusKey = `doc_status_${docId}`;
    const markNowKey = `doc_uploaded_now_${docId}`;
    const rawStatus = readTrimmed(formData, statusKey);
    if (!rawStatus || !isPayerCredentialingDocStatus(rawStatus)) continue;

    const markNow = formData.get(markNowKey) === "1";
    const prevStatus = String(doc.status ?? "");
    let uploaded_at: string | null = doc.uploaded_at ? String(doc.uploaded_at) : null;

    if (rawStatus === "uploaded") {
      uploaded_at = markNow || !uploaded_at ? now : uploaded_at;
    } else {
      uploaded_at = null;
    }

    const prevUploaded = doc.uploaded_at ? String(doc.uploaded_at) : null;
    const noOp = rawStatus === prevStatus && uploaded_at === prevUploaded && !markNow;
    if (noOp) continue;

    const patch = {
      status: rawStatus,
      uploaded_at,
    };

    const { error: upErr } = await supabaseAdmin
      .from("payer_credentialing_documents")
      .update(patch)
      .eq("id", docId)
      .eq("credentialing_record_id", credentialingId);

    if (upErr) {
      console.warn("[credentialing] doc update:", upErr.message);
      continue;
    }

    if (rawStatus !== prevStatus || markNow) {
      const label =
        PAYER_CREDENTIALING_DOC_LABELS[doc.doc_type as PayerCredentialingDocType] ?? doc.doc_type;
      await insertCredentialingActivity({
        credentialingRecordId: credentialingId,
        activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.document_update,
        summary: `Document: ${label}`,
        details: `Status: ${prevStatus} → ${rawStatus}${markNow ? " (upload timestamp set)" : ""}`,
        createdByUserId: staff.user_id,
      });
    }
  }

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${credentialingId}`);
}

function inferMimeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    csv: "text/csv",
    zip: "application/zip",
  };
  return map[ext] ?? "";
}

function effectiveAttachmentMime(file: File): string {
  const t = file.type.trim().toLowerCase();
  if (t) return t;
  return inferMimeFromFileName(file.name);
}

const UPLOAD_USER_MESSAGES: Record<string, string> = {
  missing_file: "Choose a file to upload.",
  too_large: `File is too large (max ${Math.round(PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB).`,
  type: "That file type is not allowed. Use PDF, images, Word, Excel, CSV, TXT, or ZIP.",
  record: "Could not verify this payer record.",
  storage: "Storage upload failed. Check the payer-credentialing bucket and policies.",
  db: "Saved to storage but database insert failed; the file was removed from storage.",
  bucket_config: "Storage bucket is not configured.",
  forbidden: "You do not have permission to upload.",
  invalid_record: "Invalid credentialing record.",
  unexpected: "Something went wrong during upload. Please try again.",
};

export type BulkUploadResult = {
  ok: boolean;
  uploaded: Array<{ fileName: string; attachmentId?: string }>;
  failed: Array<{ fileName: string; code: string; message: string }>;
  message?: string;
};

async function uploadOneCredentialingAttachment(params: {
  credentialingId: string;
  staffUserId: string;
  file: File;
  category: string | null;
  description: string | null;
}): Promise<
  | { ok: true; fileName: string; attachmentId: string }
  | { ok: false; fileName: string; code: string; message: string }
> {
  const { credentialingId, staffUserId, file, category, description } = params;
  const displayName = typeof file.name === "string" && file.name.trim() ? file.name : "file";

  try {
    if (file.size < 1) {
      return { ok: false, fileName: displayName, code: "missing_file", message: UPLOAD_USER_MESSAGES.missing_file };
    }
    if (file.size > PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES) {
      return { ok: false, fileName: displayName, code: "too_large", message: UPLOAD_USER_MESSAGES.too_large };
    }

    const mime = effectiveAttachmentMime(file);
    if (!mime || !isAllowedPayerCredentialingMime(mime)) {
      return { ok: false, fileName: displayName, code: "type", message: UPLOAD_USER_MESSAGES.type };
    }

    const safeName = sanitizePayerCredentialingFileName(displayName);
    const buffer = Buffer.from(await file.arrayBuffer());

    let attachmentId = randomUUID();
    let storagePath = `${credentialingId}/${attachmentId}/${safeName}`;
    let { error: upErr } = await supabaseAdmin.storage
      .from(PAYER_CREDENTIALING_STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: mime,
        upsert: false,
      });

    if (upErr) {
      const msg = (upErr.message ?? "").toLowerCase();
      const duplicate =
        msg.includes("duplicate") || msg.includes("already exists") || msg.includes("resource already");
      if (duplicate) {
        attachmentId = randomUUID();
        storagePath = `${credentialingId}/${attachmentId}/${safeName}`;
        ({ error: upErr } = await supabaseAdmin.storage
          .from(PAYER_CREDENTIALING_STORAGE_BUCKET)
          .upload(storagePath, buffer, {
            contentType: mime,
            upsert: false,
          }));
      }
    }

    if (upErr) {
      console.warn("[credentialing] attachment storage upload:", displayName, upErr.message);
      return { ok: false, fileName: displayName, code: "storage", message: UPLOAD_USER_MESSAGES.storage };
    }

    const { error: insErr } = await supabaseAdmin.from("payer_credentialing_attachments").insert({
      id: attachmentId,
      credentialing_record_id: credentialingId,
      storage_path: storagePath,
      file_name: displayName,
      file_type: mime,
      file_size: file.size,
      category,
      description,
      uploaded_by_user_id: staffUserId,
    });

    if (insErr) {
      console.warn("[credentialing] attachment insert:", displayName, insErr.message);
      const { error: rmErr } = await supabaseAdmin.storage
        .from(PAYER_CREDENTIALING_STORAGE_BUCKET)
        .remove([storagePath]);
      if (rmErr) {
        console.error("[credentialing] orphan storage after failed DB insert:", storagePath, rmErr.message);
      }
      return { ok: false, fileName: displayName, code: "db", message: UPLOAD_USER_MESSAGES.db };
    }

    const detailParts = [`File: ${displayName}`, `Type: ${mime}`, `Size: ${file.size} bytes`];
    if (category) detailParts.push(`Category: ${category}`);
    if (description) detailParts.push(`Note: ${description}`);

    await insertCredentialingActivity({
      credentialingRecordId: credentialingId,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.attachment_added,
      summary: `Attachment uploaded: ${displayName}`,
      details: detailParts.join("\n"),
      createdByUserId: staffUserId,
    });

    return { ok: true, fileName: displayName, attachmentId };
  } catch (err) {
    console.error("[credentialing] uploadOneCredentialingAttachment:", displayName, err);
    return {
      ok: false,
      fileName: displayName,
      code: "unexpected",
      message: UPLOAD_USER_MESSAGES.unexpected,
    };
  }
}

/**
 * Bulk upload (useActionState): never throws; per-file results; no redirects.
 */
export async function uploadPayerCredentialingAttachmentAction(
  _prevState: BulkUploadResult | null,
  formData: FormData
): Promise<BulkUploadResult> {
  const empty = (): BulkUploadResult => ({
    ok: false,
    uploaded: [],
    failed: [],
  });

  try {
    const staff = await getStaffProfile();
    if (!staff || !isManagerOrHigher(staff)) {
      return {
        ...empty(),
        message: UPLOAD_USER_MESSAGES.forbidden,
        failed: [{ fileName: "—", code: "forbidden", message: UPLOAD_USER_MESSAGES.forbidden }],
      };
    }

    const credentialingId = readTrimmed(formData, "credentialing_id");
    if (!credentialingId || !UUID_RE.test(credentialingId)) {
      return {
        ...empty(),
        message: UPLOAD_USER_MESSAGES.invalid_record,
        failed: [{ fileName: "—", code: "invalid_record", message: UPLOAD_USER_MESSAGES.invalid_record }],
      };
    }

    if (!PAYER_CREDENTIALING_STORAGE_BUCKET?.trim()) {
      console.error("[credentialing] upload: PAYER_CREDENTIALING_STORAGE_BUCKET is empty");
      return {
        ...empty(),
        message: UPLOAD_USER_MESSAGES.bucket_config,
        failed: [{ fileName: "—", code: "bucket_config", message: UPLOAD_USER_MESSAGES.bucket_config }],
      };
    }

    const { data: record, error: recErr } = await supabaseAdmin
      .from("payer_credentialing_records")
      .select("id")
      .eq("id", credentialingId)
      .maybeSingle();

    if (recErr || !record?.id) {
      console.warn("[credentialing] upload record fetch:", recErr?.message);
      return {
        ...empty(),
        message: UPLOAD_USER_MESSAGES.record,
        failed: [{ fileName: "—", code: "record", message: UPLOAD_USER_MESSAGES.record }],
      };
    }

    const rawFiles = formData.getAll("files");
    const files: File[] = [];
    for (const entry of rawFiles) {
      if (entry instanceof File && entry.size > 0) {
        files.push(entry);
      }
    }

    if (files.length === 0) {
      return {
        ok: false,
        uploaded: [],
        failed: [{ fileName: "—", code: "missing_file", message: UPLOAD_USER_MESSAGES.missing_file }],
        message: UPLOAD_USER_MESSAGES.missing_file,
      };
    }

    const category = readTrimmed(formData, "attachment_category");
    const description = readTrimmed(formData, "attachment_description");

    const uploaded: BulkUploadResult["uploaded"] = [];
    const failed: BulkUploadResult["failed"] = [];

    for (const file of files) {
      const result = await uploadOneCredentialingAttachment({
        credentialingId,
        staffUserId: staff.user_id,
        file,
        category,
        description,
      });
      if (result.ok) {
        uploaded.push({ fileName: result.fileName, attachmentId: result.attachmentId });
      } else {
        failed.push({ fileName: result.fileName, code: result.code, message: result.message });
      }
    }

    if (uploaded.length > 0) {
      revalidatePath("/admin/credentialing");
      revalidatePath(`/admin/credentialing/${credentialingId}`);
    }

    const allOk = failed.length === 0 && uploaded.length > 0;
    let message: string | undefined;
    if (uploaded.length > 0 && failed.length > 0) {
      message = `${uploaded.length} file(s) uploaded; ${failed.length} failed.`;
    } else if (uploaded.length === 0 && failed.length > 0) {
      message = "No files were uploaded.";
    } else if (uploaded.length > 0) {
      message =
        uploaded.length === 1
          ? "Attachment uploaded successfully."
          : `${uploaded.length} attachments uploaded successfully.`;
    }

    return {
      ok: allOk,
      uploaded,
      failed,
      message,
    };
  } catch (err) {
    console.error("[credentialing] uploadPayerCredentialingAttachmentAction:", err);
    return {
      ok: false,
      uploaded: [],
      failed: [{ fileName: "—", code: "unexpected", message: UPLOAD_USER_MESSAGES.unexpected }],
      message: UPLOAD_USER_MESSAGES.unexpected,
    };
  }
}

export type DeletePayerCredentialingAttachmentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function deletePayerCredentialingAttachment(
  formData: FormData
): Promise<DeletePayerCredentialingAttachmentResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "You do not have permission to delete attachments." };
  }

  const credentialingId = readTrimmed(formData, "credentialing_id");
  const attachmentId = readTrimmed(formData, "attachment_id");
  if (!credentialingId || !attachmentId || !UUID_RE.test(credentialingId) || !UUID_RE.test(attachmentId)) {
    return { ok: false, error: "Invalid request." };
  }

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("payer_credentialing_attachments")
    .select("id, storage_path, file_name")
    .eq("id", attachmentId)
    .eq("credentialing_record_id", credentialingId)
    .maybeSingle();

  if (fetchErr || !row?.storage_path) {
    console.warn("[credentialing] attachment delete fetch:", fetchErr?.message);
    return { ok: false, error: "Attachment not found or could not be loaded." };
  }

  const path = String(row.storage_path).trim();
  if (!path) {
    return { ok: false, error: "Attachment has no storage path." };
  }

  const fileLabel = typeof row.file_name === "string" && row.file_name.trim() ? row.file_name.trim() : "file";

  const { error: storageErr } = await supabaseAdmin.storage
    .from(PAYER_CREDENTIALING_STORAGE_BUCKET)
    .remove([path]);

  if (storageErr) {
    console.warn("[credentialing] attachment storage remove:", path, storageErr.message);
    return {
      ok: false,
      error:
        "The file could not be removed from storage, so the attachment was left in place. Try again or contact support.",
    };
  }

  const { error: delErr } = await supabaseAdmin
    .from("payer_credentialing_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("credentialing_record_id", credentialingId);

  if (delErr) {
    console.error(
      "[credentialing] attachment DB delete failed after storage remove (orphan storage risk mitigated; DB stale):",
      delErr.message,
      path
    );
    return {
      ok: false,
      error:
        "The file was removed from storage, but the database could not be updated. Contact support so the record can be reconciled.",
    };
  }

  await insertCredentialingActivity({
    credentialingRecordId: credentialingId,
    activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.attachment_removed,
    summary: `Deleted attachment: ${fileLabel}`,
    details: path,
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${credentialingId}`);
  return { ok: true };
}

const EMAIL_LABEL_MAX = 120;

/** Replace all email rows for a payer credentialing record; keeps legacy primary_contact_email in sync. */
export async function savePayerCredentialingRecordEmails(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const recordId = readTrimmed(formData, "credentialing_id");
  if (!recordId || !UUID_RE.test(recordId)) return;

  const countRaw = readTrimmed(formData, "email_row_count");
  const count = Math.min(24, Math.max(0, parseInt(countRaw ?? "0", 10) || 0));

  const rows: { email: string; label: string | null; is_primary: boolean; sort_order: number }[] = [];
  for (let i = 0; i < count; i++) {
    const addr = readTrimmed(formData, `email_${i}_address`);
    if (!addr) continue;
    const labelRaw = readTrimmed(formData, `email_${i}_label`);
    const label =
      labelRaw && labelRaw.length <= EMAIL_LABEL_MAX ? labelRaw : labelRaw ? labelRaw.slice(0, EMAIL_LABEL_MAX) : null;
    rows.push({ email: addr.trim(), label, is_primary: false, sort_order: rows.length });
  }

  if (rows.length === 0) {
    await supabaseAdmin.from("payer_credentialing_record_emails").delete().eq("credentialing_record_id", recordId);
    await supabaseAdmin.from("payer_credentialing_records").update({ primary_contact_email: null }).eq("id", recordId);
    revalidatePath("/admin/credentialing");
    revalidatePath(`/admin/credentialing/${recordId}`);
    return;
  }

  const primaryPick = readTrimmed(formData, "email_primary");
  let primaryIdx = 0;
  if (primaryPick !== null && /^\d+$/.test(primaryPick)) {
    primaryIdx = Math.min(rows.length - 1, Math.max(0, parseInt(primaryPick, 10)));
  }
  rows.forEach((r, i) => {
    r.is_primary = i === primaryIdx;
    r.sort_order = i;
  });

  const primaryAddr = rows[primaryIdx].email;

  const { error: delErr } = await supabaseAdmin
    .from("payer_credentialing_record_emails")
    .delete()
    .eq("credentialing_record_id", recordId);
  if (delErr) {
    console.warn("[credentialing] emails delete:", delErr.message);
    return;
  }

  for (const r of rows) {
    const { error: insErr } = await supabaseAdmin.from("payer_credentialing_record_emails").insert({
      credentialing_record_id: recordId,
      email: r.email,
      label: r.label,
      is_primary: r.is_primary,
      sort_order: r.sort_order,
    });
    if (insErr) {
      console.warn("[credentialing] emails insert:", insErr.message);
      return;
    }
  }

  const { error: upErr } = await supabaseAdmin
    .from("payer_credentialing_records")
    .update({ primary_contact_email: primaryAddr })
    .eq("id", recordId);
  if (upErr) {
    console.warn("[credentialing] emails primary column sync:", upErr.message);
    return;
  }

  await insertCredentialingActivity({
    credentialingRecordId: recordId,
    activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.record_updated,
    summary: "Contact emails updated",
    details: `${rows.length} address(es); primary: ${primaryAddr}`,
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${recordId}`);
}
