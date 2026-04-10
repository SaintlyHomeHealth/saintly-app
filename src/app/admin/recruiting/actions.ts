"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ApplyableResumeField } from "@/lib/recruiting/resume-parse-types";
import {
  isValidRecruitingDiscipline,
  isValidRecruitingSource,
  isValidRecruitingStatus,
} from "@/lib/recruiting/recruiting-options";
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

export async function createRecruitingCandidate(formData: FormData) {
  await requireManager();

  const full_name = str(formData, "full_name");
  if (!full_name) {
    redirect("/admin/recruiting/new?error=missing_name");
  }

  const sourceRaw = str(formData, "source");
  const source = sourceRaw ? (isValidRecruitingSource(sourceRaw) ? sourceRaw : sourceRaw) : "Indeed";

  const disciplineRaw = str(formData, "discipline");
  const discipline = disciplineRaw ? (isValidRecruitingDiscipline(disciplineRaw) ? disciplineRaw : disciplineRaw) : null;

  const assignedRaw = str(formData, "assigned_to");
  const assigned_to = assignedRaw && uuidOk(assignedRaw) ? assignedRaw : null;

  const { data, error } = await supabaseAdmin
    .from("recruiting_candidates")
    .insert({
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
      status: "New",
      assigned_to,
      indeed_url: optStr(formData, "indeed_url"),
      notes: optStr(formData, "notes"),
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.warn("[recruiting] createRecruitingCandidate:", error?.message);
    redirect("/admin/recruiting/new?error=save_failed");
  }

  revalidatePath("/admin/recruiting");
  redirect(`/admin/recruiting/${data.id}`);
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

  const assignedRaw = str(formData, "assigned_to");
  const assigned_to = assignedRaw && uuidOk(assignedRaw) ? assignedRaw : null;

  const last_call_at = parseIsoDatetime(str(formData, "last_call_at"));
  const last_text_at = parseIsoDatetime(str(formData, "last_text_at"));
  const last_contact_at = parseIsoDatetime(str(formData, "last_contact_at"));
  const next_follow_up_at = parseIsoDatetime(str(formData, "next_follow_up_at"));

  const { error } = await supabaseAdmin
    .from("recruiting_candidates")
    .update({
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
      assigned_to,
      indeed_url: optStr(formData, "indeed_url"),
      resume_url: optStr(formData, "resume_url"),
      notes: optStr(formData, "notes"),
      last_call_at,
      last_text_at,
      last_contact_at,
      next_follow_up_at,
    })
    .eq("id", id);

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
      if (prevStatus === "New") {
        patch.status = "Text Sent";
      } else {
        patch.status = "Waiting on Reply";
      }
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
    .select("id, full_name, first_name, last_name, phone, email, city, state, discipline, notes")
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
