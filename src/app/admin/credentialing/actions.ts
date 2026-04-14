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
  primary_contact_email: string | null;
  notes: string | null;
  last_follow_up_at: string | null;
  assigned_owner_user_id: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
  priority: string | null;
};

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
    .select(
      "id, payer_name, payer_type, market_state, credentialing_status, contracting_status, portal_url, portal_username_hint, primary_contact_name, primary_contact_phone, primary_contact_email, notes, last_follow_up_at, assigned_owner_user_id, next_action, next_action_due_date, priority"
    )
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

  const payload: Record<string, unknown> = {
    payer_name: readTrimmed(formData, "payer_name"),
    payer_type: readTrimmed(formData, "payer_type"),
    market_state: readTrimmed(formData, "market_state"),
    portal_url: readTrimmed(formData, "portal_url"),
    portal_username_hint: readTrimmed(formData, "portal_username_hint"),
    primary_contact_name: readTrimmed(formData, "primary_contact_name"),
    primary_contact_phone: readTrimmed(formData, "primary_contact_phone"),
    primary_contact_email: readTrimmed(formData, "primary_contact_email"),
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
    .select(
      "id, payer_name, payer_type, market_state, credentialing_status, contracting_status, portal_url, portal_username_hint, primary_contact_name, primary_contact_phone, primary_contact_email, notes, last_follow_up_at, assigned_owner_user_id, next_action, next_action_due_date, priority"
    )
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

export type UploadPayerCredentialingAttachmentResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * useActionState-compatible upload: never throws; returns structured errors for inline UI.
 */
export async function uploadPayerCredentialingAttachmentAction(
  _prevState: UploadPayerCredentialingAttachmentResult | null,
  formData: FormData
): Promise<UploadPayerCredentialingAttachmentResult> {
  try {
    const staff = await getStaffProfile();
    if (!staff || !isManagerOrHigher(staff)) {
      return { ok: false, code: "forbidden", message: UPLOAD_USER_MESSAGES.forbidden };
    }

    const credentialingId = readTrimmed(formData, "credentialing_id");
    if (!credentialingId || !UUID_RE.test(credentialingId)) {
      return { ok: false, code: "invalid_record", message: UPLOAD_USER_MESSAGES.invalid_record };
    }

    if (!PAYER_CREDENTIALING_STORAGE_BUCKET?.trim()) {
      console.error("[credentialing] upload: PAYER_CREDENTIALING_STORAGE_BUCKET is empty");
      return { ok: false, code: "bucket_config", message: UPLOAD_USER_MESSAGES.bucket_config };
    }

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return { ok: false, code: "missing_file", message: UPLOAD_USER_MESSAGES.missing_file };
    }
    if (fileEntry.size < 1) {
      return { ok: false, code: "missing_file", message: UPLOAD_USER_MESSAGES.missing_file };
    }

    if (fileEntry.size > PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES) {
      return { ok: false, code: "too_large", message: UPLOAD_USER_MESSAGES.too_large };
    }

    const mime = effectiveAttachmentMime(fileEntry);
    if (!mime || !isAllowedPayerCredentialingMime(mime)) {
      return { ok: false, code: "type", message: UPLOAD_USER_MESSAGES.type };
    }

    const { data: record, error: recErr } = await supabaseAdmin
      .from("payer_credentialing_records")
      .select("id")
      .eq("id", credentialingId)
      .maybeSingle();

    if (recErr || !record?.id) {
      console.warn("[credentialing] upload record fetch:", recErr?.message);
      return { ok: false, code: "record", message: UPLOAD_USER_MESSAGES.record };
    }

    const displayName = typeof fileEntry.name === "string" && fileEntry.name.trim() ? fileEntry.name : "file";
    const safeName = sanitizePayerCredentialingFileName(displayName);

    const category = readTrimmed(formData, "attachment_category");
    const description = readTrimmed(formData, "attachment_description");

    const buffer = Buffer.from(await fileEntry.arrayBuffer());

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
      console.warn("[credentialing] attachment storage upload:", upErr.message, upErr);
      return { ok: false, code: "storage", message: UPLOAD_USER_MESSAGES.storage };
    }

    const { error: insErr } = await supabaseAdmin.from("payer_credentialing_attachments").insert({
      id: attachmentId,
      credentialing_record_id: credentialingId,
      storage_path: storagePath,
      file_name: displayName,
      file_type: mime,
      file_size: fileEntry.size,
      category,
      description,
      uploaded_by_user_id: staff.user_id,
    });

    if (insErr) {
      console.warn("[credentialing] attachment insert:", insErr.message);
      const { error: rmErr } = await supabaseAdmin.storage
        .from(PAYER_CREDENTIALING_STORAGE_BUCKET)
        .remove([storagePath]);
      if (rmErr) {
        console.error("[credentialing] orphan storage object after failed DB insert:", storagePath, rmErr.message);
      }
      return { ok: false, code: "db", message: UPLOAD_USER_MESSAGES.db };
    }

    const detailParts = [`File: ${displayName}`, `Type: ${mime}`, `Size: ${fileEntry.size} bytes`];
    if (category) detailParts.push(`Category: ${category}`);
    if (description) detailParts.push(`Note: ${description}`);

    await insertCredentialingActivity({
      credentialingRecordId: credentialingId,
      activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.attachment_added,
      summary: `Attachment uploaded: ${displayName}`,
      details: detailParts.join("\n"),
      createdByUserId: staff.user_id,
    });

    revalidatePath(`/admin/credentialing/${credentialingId}`);
    return { ok: true };
  } catch (err) {
    console.error("[credentialing] uploadPayerCredentialingAttachmentAction:", err);
    return { ok: false, code: "unexpected", message: UPLOAD_USER_MESSAGES.unexpected };
  }
}

export async function deletePayerCredentialingAttachment(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const credentialingId = readTrimmed(formData, "credentialing_id");
  const attachmentId = readTrimmed(formData, "attachment_id");
  if (!credentialingId || !attachmentId || !UUID_RE.test(credentialingId) || !UUID_RE.test(attachmentId)) {
    return;
  }

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("payer_credentialing_attachments")
    .select("id, storage_path, file_name")
    .eq("id", attachmentId)
    .eq("credentialing_record_id", credentialingId)
    .maybeSingle();

  if (fetchErr || !row?.storage_path) {
    console.warn("[credentialing] attachment delete fetch:", fetchErr?.message);
    return;
  }

  const path = String(row.storage_path);
  await supabaseAdmin.storage.from(PAYER_CREDENTIALING_STORAGE_BUCKET).remove([path]);

  const { error: delErr } = await supabaseAdmin
    .from("payer_credentialing_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("credentialing_record_id", credentialingId);

  if (delErr) {
    console.warn("[credentialing] attachment delete:", delErr.message);
    return;
  }

  await insertCredentialingActivity({
    credentialingRecordId: credentialingId,
    activityType: PAYER_CREDENTIALING_ACTIVITY_TYPES.attachment_removed,
    summary: `Attachment removed: ${row.file_name ?? "file"}`,
    details: path,
    createdByUserId: staff.user_id,
  });

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${credentialingId}`);
}
