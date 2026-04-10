"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ApplyableResumeField } from "@/lib/recruiting/resume-parse-types";
import {
  isValidRecruitingDiscipline,
  isValidRecruitingInterestLevel,
  isValidRecruitingPreferredContact,
  isValidRecruitingSource,
  isValidRecruitingStatus,
} from "@/lib/recruiting/recruiting-options";
import {
  normalizeRecruitingEmail,
  normalizeRecruitingPhoneForStorage,
  recruitingNameCityKey,
} from "@/lib/recruiting/recruiting-contact-normalize";
import { findRecruitingDuplicateCandidates, type RecruitingDuplicateRow } from "@/lib/recruiting/recruiting-duplicates";
import { RECRUITING_RESUMES_BUCKET } from "@/lib/recruiting/recruiting-resume-storage";
import { resumeParsedActivityBody, runResumeExtractPipeline } from "@/lib/recruiting/resume-extract-pipeline";
import {
  isResumeMimeAllowed,
  resumeFileMimeFromFile,
  RESUME_HARD_ERROR_CHOOSE_FILE,
  RESUME_HARD_ERROR_INVALID_FILE,
  RESUME_HARD_ERROR_TOO_LARGE,
} from "@/lib/recruiting/resume-upload-mime";
import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optStr(formData: FormData, key: string): string | null {
  const s = str(formData, key);
  return s ? s : null;
}

function parseIsoDatetime(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function guessContentType(filename: string): string {
  const l = filename.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (l.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

function sanitizeResumeOriginalName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "resume";
  const cleaned = base.replace(/[^a-zA-Z0-9._\- ]/g, "_").trim();
  return cleaned.slice(0, 180) || "resume";
}

const RESUME_MAX_BYTES = 10 * 1024 * 1024;
const RESUME_ALLOWED_EXT = [".pdf", ".doc", ".docx"] as const;

function resumeHasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return RESUME_ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

async function requireManager() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }
  return staff;
}

function uuidOk(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

function recruitingNormalizedFields(
  email: string | null,
  phone: string | null,
  fullName: string,
  city: string | null
): {
  normalized_email: string | null;
  normalized_phone: string | null;
  name_city_key: string | null;
} {
  return {
    normalized_email: normalizeRecruitingEmail(email),
    normalized_phone: normalizeRecruitingPhoneForStorage(phone),
    name_city_key: recruitingNameCityKey(fullName, city),
  };
}

function forceDuplicateFromForm(formData: FormData): boolean {
  return str(formData, "force_duplicate") === "1";
}

export type CreateRecruitingCandidateResult =
  | { ok: true; candidateId: string }
  | { ok: false; reason: "duplicates"; duplicates: RecruitingDuplicateRow[] }
  | { ok: false; reason: "missing_name" | "save_failed" };

export async function createRecruitingCandidate(formData: FormData): Promise<CreateRecruitingCandidateResult> {
  await requireManager();

  const full_name = str(formData, "full_name");
  if (!full_name) {
    return { ok: false, reason: "missing_name" };
  }

  const sourceRaw = str(formData, "source");
  const source = sourceRaw ? (isValidRecruitingSource(sourceRaw) ? sourceRaw : sourceRaw) : "Indeed";

  const disciplineRaw = str(formData, "discipline");
  const discipline = disciplineRaw ? (isValidRecruitingDiscipline(disciplineRaw) ? disciplineRaw : disciplineRaw) : null;

  const assignedRaw = str(formData, "assigned_to");
  const assigned_to = assignedRaw && uuidOk(assignedRaw) ? assignedRaw : null;

  const interestRaw = str(formData, "interest_level");
  const interest_level = interestRaw ? (isValidRecruitingInterestLevel(interestRaw) ? interestRaw : interestRaw) : null;

  const email = optStr(formData, "email");
  const phone = optStr(formData, "phone");
  const city = optStr(formData, "city");

  if (!forceDuplicateFromForm(formData)) {
    const duplicates = await findRecruitingDuplicateCandidates(supabaseAdmin, {
      email,
      phone,
      fullName: full_name,
      city,
    });
    if (duplicates.length > 0) {
      return { ok: false, reason: "duplicates", duplicates };
    }
  }

  const norm = recruitingNormalizedFields(email, phone, full_name, city);

  const { data, error } = await supabaseAdmin
    .from("recruiting_candidates")
    .insert({
      full_name,
      first_name: optStr(formData, "first_name"),
      last_name: optStr(formData, "last_name"),
      phone,
      email,
      city,
      state: optStr(formData, "state"),
      zip: optStr(formData, "zip"),
      coverage_area: optStr(formData, "coverage_area"),
      discipline,
      source,
      status: "New",
      assigned_to,
      indeed_url: optStr(formData, "indeed_url"),
      notes: optStr(formData, "notes"),
      interest_level,
      specialties: optStr(formData, "specialties"),
      recruiting_tags: optStr(formData, "recruiting_tags"),
      follow_up_bucket: optStr(formData, "follow_up_bucket"),
      preferred_contact_method: (() => {
        const p = str(formData, "preferred_contact_method");
        return p && isValidRecruitingPreferredContact(p) ? p : p || null;
      })(),
      ...norm,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.warn("[recruiting] createRecruitingCandidate:", error?.message);
    return { ok: false, reason: "save_failed" };
  }

  revalidatePath("/admin/recruiting");
  return { ok: true, candidateId: data.id as string };
}

export async function updateRecruitingCandidate(formData: FormData) {
  await requireManager();

  const id = str(formData, "id");
  if (!id || !uuidOk(id)) {
    redirect("/admin/recruiting");
  }

  const full_name = str(formData, "full_name");
  if (!full_name) {
    redirect(`/admin/recruiting/${id}?error=missing_name`);
  }

  const sourceRaw = str(formData, "source");
  const source = sourceRaw ? (isValidRecruitingSource(sourceRaw) ? sourceRaw : sourceRaw) : "Indeed";

  const disciplineRaw = str(formData, "discipline");
  const discipline = disciplineRaw ? (isValidRecruitingDiscipline(disciplineRaw) ? disciplineRaw : disciplineRaw) : null;

  const statusRaw = str(formData, "status");
  const status = statusRaw ? (isValidRecruitingStatus(statusRaw) ? statusRaw : statusRaw) : "New";

  const interestRaw = str(formData, "interest_level");
  const interest_level = interestRaw ? (isValidRecruitingInterestLevel(interestRaw) ? interestRaw : interestRaw) : null;

  const preferredRaw = str(formData, "preferred_contact_method");
  const preferred_contact_method = preferredRaw
    ? isValidRecruitingPreferredContact(preferredRaw)
      ? preferredRaw
      : preferredRaw
    : null;

  const assignedRaw = str(formData, "assigned_to");
  const assigned_to = assignedRaw && uuidOk(assignedRaw) ? assignedRaw : null;

  const last_call_at = parseIsoDatetime(str(formData, "last_call_at"));
  const last_text_at = parseIsoDatetime(str(formData, "last_text_at"));
  const last_contact_at = parseIsoDatetime(str(formData, "last_contact_at"));
  const next_follow_up_at = parseIsoDatetime(str(formData, "next_follow_up_at"));
  const last_response_at = parseIsoDatetime(str(formData, "last_response_at"));

  const { data: smsRow } = await supabaseAdmin
    .from("recruiting_candidates")
    .select("sms_opt_out")
    .eq("id", id)
    .maybeSingle();

  const prevSmsOptOut = Boolean((smsRow as { sms_opt_out?: boolean } | null)?.sms_opt_out);
  const smsOptOut = formData.get("sms_opt_out") === "on";
  const nowIso = new Date().toISOString();
  let sms_opt_out_at: string | null | undefined;
  if (smsOptOut && !prevSmsOptOut) {
    sms_opt_out_at = nowIso;
  } else if (!smsOptOut) {
    sms_opt_out_at = null;
  }

  const updatePayload: Record<string, unknown> = {
    full_name,
    first_name: optStr(formData, "first_name"),
    last_name: optStr(formData, "last_name"),
    phone: optStr(formData, "phone"),
    email: optStr(formData, "email"),
    city: optStr(formData, "city"),
    state: optStr(formData, "state"),
    zip: optStr(formData, "zip"),
    coverage_area: optStr(formData, "coverage_area"),
    discipline,
    source,
    status,
    interest_level,
    assigned_to,
    indeed_url: optStr(formData, "indeed_url"),
    resume_url: optStr(formData, "resume_url"),
    notes: optStr(formData, "notes"),
    specialties: optStr(formData, "specialties"),
    recruiting_tags: optStr(formData, "recruiting_tags"),
    follow_up_bucket: optStr(formData, "follow_up_bucket"),
    preferred_contact_method,
    last_call_at,
    last_text_at,
    last_contact_at,
    last_response_at,
    next_follow_up_at,
    sms_opt_out: smsOptOut,
  };

  if (sms_opt_out_at !== undefined) {
    updatePayload.sms_opt_out_at = sms_opt_out_at;
  }

  const emailUp = optStr(formData, "email");
  const phoneUp = optStr(formData, "phone");
  const cityUp = optStr(formData, "city");
  Object.assign(updatePayload, recruitingNormalizedFields(emailUp, phoneUp, full_name, cityUp));

  const { error } = await supabaseAdmin.from("recruiting_candidates").update(updatePayload).eq("id", id);

  if (error) {
    console.warn("[recruiting] updateRecruitingCandidate:", error.message);
    redirect(`/admin/recruiting/${id}?error=save_failed`);
  }

  revalidatePath("/admin/recruiting");
  revalidatePath(`/admin/recruiting/${id}`);
  redirect(`/admin/recruiting/${id}`);
}

export type RecruitingQuickActionKind =
  | "call"
  | "text"
  | "no_answer"
  | "voicemail"
  | "spoke"
  | "interested"
  | "not_interested"
  | "maybe_later"
  | "follow_up_later"
  | "no_response"
  | "follow_up_set"
  | "note";

export async function recruitingQuickAction(input: {
  candidateId: string;
  kind: RecruitingQuickActionKind;
  /** Optional note body for follow_up_set and note */
  body?: string | null;
  /** ISO string for follow_up_set */
  nextFollowUpAt?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireManager();
  const user = await getAuthenticatedUser();

  const candidateId = input.candidateId?.trim() ?? "";
  if (!uuidOk(candidateId)) {
    return { ok: false, message: "Invalid candidate." };
  }

  const nowIso = new Date().toISOString();

  const { data: before, error: fetchErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .select("id, status")
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchErr || !before?.id) {
    return { ok: false, message: "Candidate not found." };
  }

  const prevStatus = typeof before.status === "string" ? before.status : "New";

  let activity_type = "note";
  let outcome: string | null = null;
  const body: string | null = input.body?.trim() ? input.body.trim() : null;

  const patch: Record<string, unknown> = {};

  switch (input.kind) {
    case "call":
      activity_type = "call";
      outcome = "outbound";
      patch.last_call_at = nowIso;
      patch.last_contact_at = nowIso;
      break;
    case "text":
      activity_type = "text";
      outcome = "sent";
      patch.last_text_at = nowIso;
      patch.last_contact_at = nowIso;
      patch.status = "Text Sent";
      break;
    case "no_answer":
      activity_type = "call";
      outcome = "no_answer";
      patch.last_call_at = nowIso;
      patch.last_contact_at = nowIso;
      if (prevStatus === "New") {
        patch.status = "Attempted Contact";
      }
      break;
    case "voicemail":
      activity_type = "voicemail";
      outcome = "left_voicemail";
      patch.last_call_at = nowIso;
      patch.last_contact_at = nowIso;
      break;
    case "spoke":
      activity_type = "call";
      outcome = "spoke";
      patch.last_call_at = nowIso;
      patch.last_contact_at = nowIso;
      patch.status = "Spoke";
      break;
    case "interested":
      activity_type = "status_change";
      outcome = "interested";
      patch.last_contact_at = nowIso;
      patch.status = "Interested";
      break;
    case "not_interested":
      activity_type = "status_change";
      outcome = "not_interested";
      patch.last_contact_at = nowIso;
      patch.status = "Not Interested";
      break;
    case "maybe_later":
      activity_type = "status_change";
      outcome = "maybe_later";
      patch.last_contact_at = nowIso;
      patch.status = "Maybe Later";
      patch.interest_level = "maybe_later";
      break;
    case "follow_up_later":
      activity_type = "status_change";
      outcome = "follow_up_later";
      patch.last_contact_at = nowIso;
      patch.status = "Follow Up Later";
      break;
    case "no_response":
      activity_type = "status_change";
      outcome = "no_response";
      patch.last_contact_at = nowIso;
      patch.status = "No Response";
      break;
    case "follow_up_set": {
      activity_type = "follow_up_set";
      outcome = null;
      const when = input.nextFollowUpAt?.trim()
        ? parseIsoDatetime(input.nextFollowUpAt.trim())
        : null;
      if (!when) {
        return { ok: false, message: "Pick a follow-up date and time." };
      }
      patch.next_follow_up_at = when;
      patch.last_contact_at = nowIso;
      break;
    }
    case "note":
      activity_type = "note";
      outcome = null;
      if (!body) {
        return { ok: false, message: "Add a note first." };
      }
      patch.last_contact_at = nowIso;
      break;
    default:
      return { ok: false, message: "Unknown action." };
  }

  const { error: actErr } = await supabaseAdmin.from("recruiting_candidate_activities").insert({
    candidate_id: candidateId,
    activity_type,
    outcome,
    body,
    created_by: user?.id ?? null,
  });

  if (actErr) {
    console.warn("[recruiting] activity insert:", actErr.message);
    return { ok: false, message: "Could not save activity." };
  }

  const { error: updErr } = await supabaseAdmin.from("recruiting_candidates").update(patch).eq("id", candidateId);

  if (updErr) {
    console.warn("[recruiting] candidate update:", updErr.message);
    return { ok: false, message: "Could not update candidate." };
  }

  revalidatePath("/admin/recruiting");
  revalidatePath(`/admin/recruiting/${candidateId}`);
  return { ok: true };
}

function isBlankField(v: unknown): boolean {
  if (v == null) return true;
  return String(v).trim() === "";
}

export async function applyRecruitingResumeSuggestions(input: {
  candidateId: string;
  values: Partial<Record<ApplyableResumeField, string>>;
  overwrite: Partial<Record<ApplyableResumeField, boolean>>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireManager();
  const user = await getAuthenticatedUser();

  const candidateId = input.candidateId?.trim() ?? "";
  if (!uuidOk(candidateId)) {
    return { ok: false, message: "Invalid candidate." };
  }

  const { data: row, error } = await supabaseAdmin
    .from("recruiting_candidates")
    .select("id, full_name, first_name, last_name, phone, email, city, state, discipline, notes, specialties")
    .eq("id", candidateId)
    .maybeSingle();

  if (error || !row?.id) {
    return { ok: false, message: "Candidate not found." };
  }

  const patch: Record<string, unknown> = {};
  const ov = input.overwrite;
  const r = row as Record<string, unknown>;

  function applyScalar(dbKey: "full_name" | "first_name" | "last_name" | "phone" | "email" | "city" | "state" | "discipline", formKey: ApplyableResumeField) {
    const val = input.values[formKey]?.trim();
    if (!val) return;
    const cur = r[dbKey];
    if (isBlankField(cur) || ov[formKey]) {
      patch[dbKey] = val;
    }
  }

  applyScalar("full_name", "full_name");
  applyScalar("first_name", "first_name");
  applyScalar("last_name", "last_name");
  applyScalar("phone", "phone");
  applyScalar("email", "email");
  applyScalar("city", "city");
  applyScalar("state", "state");
  applyScalar("discipline", "discipline");

  const specOnly = input.values.specialties?.trim();
  if (specOnly && (isBlankField(r.specialties) || ov.specialties)) {
    patch.specialties = specOnly;
  }

  const summary = input.values.notes_summary?.trim();
  const yrs = input.values.years_of_experience?.trim();
  const spec = input.values.specialties?.trim();
  const cert = input.values.certifications?.trim();

  const parts: string[] = [];
  if (summary) parts.push(`Summary: ${summary}`);
  if (yrs) parts.push(`Experience: ${yrs}`);
  if (spec) parts.push(`Specialties: ${spec}`);
  if (cert) parts.push(`Certifications: ${cert}`);

  if (parts.length > 0) {
    const block = `From resume:\n${parts.join("\n")}`;
    const existingNotes = typeof row.notes === "string" ? row.notes.trim() : "";
    const overwriteNotes = !!ov.notes_summary;

    if (!existingNotes) {
      patch.notes = block;
    } else if (overwriteNotes) {
      patch.notes = block;
    } else {
      patch.notes = `${existingNotes}\n\n${block}`;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, message: "Nothing to apply — fill a field or enable overwrite." };
  }

  const mergedEmail = typeof patch.email === "string" ? patch.email : row.email;
  const mergedPhone = typeof patch.phone === "string" ? patch.phone : row.phone;
  const mergedFull = typeof patch.full_name === "string" ? patch.full_name : row.full_name;
  const mergedCity = typeof patch.city === "string" ? patch.city : row.city;
  Object.assign(
    patch,
    recruitingNormalizedFields(
      mergedEmail != null ? String(mergedEmail) : null,
      mergedPhone != null ? String(mergedPhone) : null,
      typeof mergedFull === "string" && mergedFull.trim() ? mergedFull : String(row.full_name ?? ""),
      mergedCity != null ? String(mergedCity) : null
    )
  );

  const { error: updErr } = await supabaseAdmin.from("recruiting_candidates").update(patch).eq("id", candidateId);

  if (updErr) {
    console.warn("[recruiting] apply resume suggestions:", updErr.message);
    return { ok: false, message: "Could not save changes." };
  }

  const { error: actErr } = await supabaseAdmin.from("recruiting_candidate_activities").insert({
    candidate_id: candidateId,
    activity_type: "resume_applied",
    outcome: null,
    body: "Applied candidate details from resume",
    created_by: user?.id ?? null,
  });

  if (actErr) {
    console.warn("[recruiting] resume_applied activity:", actErr.message);
  }

  revalidatePath("/admin/recruiting");
  revalidatePath(`/admin/recruiting/${candidateId}`);
  return { ok: true };
}

export type CreateRecruitingCandidateFromResumeResult =
  | { ok: true; candidateId: string }
  | { ok: false; reason: "duplicates"; duplicates: RecruitingDuplicateRow[] }
  | { ok: false; reason: "missing_name" | "missing_file" | "file_too_large" | "bad_type" | "save_failed" | "upload_failed" };

async function finalizeResumeAfterStorage(input: {
  candidateId: string;
  safeName: string;
  buffer: Buffer;
  userId: string | null;
  isReplace: boolean;
  oldPath: string | null;
  newStoragePath: string;
}) {
  const { candidateId, safeName, buffer, userId, isReplace, oldPath, newStoragePath } = input;

  const bodyText = isReplace ? `Replaced resume with: ${safeName}` : `Uploaded resume: ${safeName}`;
  await supabaseAdmin.from("recruiting_candidate_activities").insert({
    candidate_id: candidateId,
    activity_type: isReplace ? "resume_replaced" : "resume_uploaded",
    outcome: null,
    body: bodyText,
    created_by: userId,
  });

  let parsedBody = resumeParsedActivityBody("manual");
  try {
    const pipeline = await runResumeExtractPipeline(buffer, safeName);
    parsedBody = resumeParsedActivityBody(pipeline.quality);
  } catch {
    parsedBody = resumeParsedActivityBody("manual");
  }

  await supabaseAdmin.from("recruiting_candidate_activities").insert({
    candidate_id: candidateId,
    activity_type: "resume_parsed",
    outcome: null,
    body: parsedBody,
    created_by: userId,
  });

  if (isReplace && oldPath && oldPath !== newStoragePath) {
    const { error: rmErr } = await supabaseAdmin.storage.from(RECRUITING_RESUMES_BUCKET).remove([oldPath]);
    if (rmErr) {
      console.warn("[recruiting] resume old file remove:", rmErr.message);
    }
  }
}

export type AttachResumeToCandidateResult = { ok: true } | { ok: false; reason: string };

/** Upload/replace resume on an existing candidate (e.g. duplicate flow). Does not change profile fields. */
export async function attachResumeToExistingCandidate(formData: FormData): Promise<AttachResumeToCandidateResult> {
  await requireManager();
  const user = await getAuthenticatedUser();

  const candidateId = str(formData, "candidateId");
  if (!candidateId || !uuidOk(candidateId)) {
    return { ok: false, reason: "Invalid candidate." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, reason: RESUME_HARD_ERROR_CHOOSE_FILE };
  }

  if (file.size > RESUME_MAX_BYTES) {
    return { ok: false, reason: RESUME_HARD_ERROR_TOO_LARGE };
  }

  const originalName = file.name || "resume";
  if (!resumeHasAllowedExtension(originalName)) {
    return { ok: false, reason: RESUME_HARD_ERROR_INVALID_FILE };
  }

  const mime = resumeFileMimeFromFile(file);
  if (!isResumeMimeAllowed(mime, originalName)) {
    return { ok: false, reason: RESUME_HARD_ERROR_INVALID_FILE };
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .select("id, resume_storage_path")
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchErr || !existing?.id) {
    return { ok: false, reason: "Candidate not found." };
  }

  const safeName = sanitizeResumeOriginalName(originalName);
  const timestamp = Date.now();
  const storagePath = `${candidateId}/${timestamp}-${safeName}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = guessContentType(safeName);

  const oldPath =
    typeof existing.resume_storage_path === "string" && existing.resume_storage_path.trim()
      ? existing.resume_storage_path.trim()
      : null;
  const isReplace = Boolean(oldPath);

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(RECRUITING_RESUMES_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadErr) {
    console.warn("[recruiting] attach resume upload:", uploadErr.message);
    return { ok: false, reason: uploadErr.message || "Upload failed." };
  }

  const uploadedAt = new Date().toISOString();

  const { error: updErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .update({
      resume_file_name: safeName,
      resume_storage_path: storagePath,
      resume_uploaded_at: uploadedAt,
    })
    .eq("id", candidateId);

  if (updErr) {
    await supabaseAdmin.storage.from(RECRUITING_RESUMES_BUCKET).remove([storagePath]);
    console.warn("[recruiting] attach resume DB:", updErr.message);
    return { ok: false, reason: "Could not save resume metadata." };
  }

  await finalizeResumeAfterStorage({
    candidateId,
    safeName,
    buffer,
    userId: user?.id ?? null,
    isReplace,
    oldPath,
    newStoragePath: storagePath,
  });

  revalidatePath("/admin/recruiting");
  revalidatePath(`/admin/recruiting/${candidateId}`);
  return { ok: true };
}

export async function createRecruitingCandidateFromResume(
  formData: FormData
): Promise<CreateRecruitingCandidateFromResumeResult> {
  await requireManager();
  const user = await getAuthenticatedUser();

  const full_name = str(formData, "full_name");
  if (!full_name) {
    return { ok: false, reason: "missing_name" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, reason: "missing_file" };
  }

  if (file.size > RESUME_MAX_BYTES) {
    return { ok: false, reason: "file_too_large" };
  }

  const originalName = file.name || "resume";
  if (!resumeHasAllowedExtension(originalName)) {
    return { ok: false, reason: "bad_type" };
  }

  const mime = resumeFileMimeFromFile(file);
  if (!isResumeMimeAllowed(mime, originalName)) {
    return { ok: false, reason: "bad_type" };
  }

  const safeName = sanitizeResumeOriginalName(originalName);
  const sourceRaw = str(formData, "source");
  const source = sourceRaw ? (isValidRecruitingSource(sourceRaw) ? sourceRaw : sourceRaw) : "Indeed";

  const disciplineRaw = str(formData, "discipline");
  const discipline = disciplineRaw ? (isValidRecruitingDiscipline(disciplineRaw) ? disciplineRaw : disciplineRaw) : null;

  const interestRaw = str(formData, "interest_level");
  const interest_level = interestRaw ? (isValidRecruitingInterestLevel(interestRaw) ? interestRaw : interestRaw) : null;

  const preferredRaw = str(formData, "preferred_contact_method");
  const preferred_contact_method = preferredRaw
    ? isValidRecruitingPreferredContact(preferredRaw)
      ? preferredRaw
      : preferredRaw
    : null;

  const email = optStr(formData, "email");
  const phone = optStr(formData, "phone");
  const city = optStr(formData, "city");

  if (!forceDuplicateFromForm(formData)) {
    const duplicates = await findRecruitingDuplicateCandidates(supabaseAdmin, {
      email,
      phone,
      fullName: full_name,
      city,
    });
    if (duplicates.length > 0) {
      return { ok: false, reason: "duplicates", duplicates };
    }
  }

  const norm = recruitingNormalizedFields(email, phone, full_name, city);

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .insert({
      full_name,
      first_name: optStr(formData, "first_name"),
      last_name: optStr(formData, "last_name"),
      phone,
      email,
      city,
      state: optStr(formData, "state"),
      coverage_area: optStr(formData, "coverage_area"),
      discipline,
      source,
      status: "New",
      notes: optStr(formData, "notes"),
      interest_level,
      specialties: optStr(formData, "specialties"),
      recruiting_tags: optStr(formData, "recruiting_tags"),
      follow_up_bucket: optStr(formData, "follow_up_bucket"),
      preferred_contact_method,
      ...norm,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !inserted?.id) {
    console.warn("[recruiting] createRecruitingCandidateFromResume insert:", insErr?.message);
    return { ok: false, reason: "save_failed" };
  }

  const candidateId = inserted.id as string;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = guessContentType(safeName);
  const timestamp = Date.now();
  const storagePath = `${candidateId}/${timestamp}-${safeName}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(RECRUITING_RESUMES_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadErr) {
    await supabaseAdmin.from("recruiting_candidates").delete().eq("id", candidateId);
    console.warn("[recruiting] create from resume upload:", uploadErr.message);
    return { ok: false, reason: "upload_failed" };
  }

  const uploadedAt = new Date().toISOString();

  const { error: updErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .update({
      resume_file_name: safeName,
      resume_storage_path: storagePath,
      resume_uploaded_at: uploadedAt,
    })
    .eq("id", candidateId);

  if (updErr) {
    await supabaseAdmin.storage.from(RECRUITING_RESUMES_BUCKET).remove([storagePath]);
    await supabaseAdmin.from("recruiting_candidates").delete().eq("id", candidateId);
    console.warn("[recruiting] create from resume DB:", updErr.message);
    return { ok: false, reason: "save_failed" };
  }

  await finalizeResumeAfterStorage({
    candidateId,
    safeName,
    buffer,
    userId: user?.id ?? null,
    isReplace: false,
    oldPath: null,
    newStoragePath: storagePath,
  });

  revalidatePath("/admin/recruiting");
  revalidatePath(`/admin/recruiting/${candidateId}`);
  return { ok: true, candidateId };
}
