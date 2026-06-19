"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import {
  findPatientReferralDuplicates,
  type PatientReferralDuplicateRow,
} from "@/lib/crm/patient-referral/duplicates";
import { DEFAULT_INTAKE_STATUS, DEFAULT_PATIENT_STATUS, isValidPatientReferralDocumentType, isValidPatientReferralSourceType } from "@/lib/crm/patient-referral/options";
import { patientReferralReviewSchema } from "@/lib/crm/patient-referral/schema";
import {
  createPatientReferralSignedUrl,
  uploadPatientReferralDocumentToStorage,
} from "@/lib/crm/patient-referral/storage";
import type { ParsedPatientReferralSuggestions, PatientReferralParsePayload } from "@/lib/crm/patient-referral/types";
import { parsePatientReferralDocumentFromFormData } from "@/lib/crm/patient-referral/parse-document";
import {
  isPatientReferralMimeAllowed,
  normalizePatientReferralBaseMime,
  patientReferralFileMimeFromFile,
  patientReferralHasAllowedExtension,
  PATIENT_REFERRAL_MAX_BYTES,
  sanitizePatientReferralFileName,
} from "@/lib/crm/patient-referral/upload-mime";
import { normalizeReferralPhone } from "@/lib/crm/patient-referral/normalize";
import { parseServiceDisciplinesFromFormData } from "@/lib/crm/service-disciplines";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function readTrimmed(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function readTrimmedOrNull(fd: FormData, key: string): string | null {
  const s = readTrimmed(fd, key);
  return s || null;
}

function readOptionalInt(fd: FormData, key: string): number | null {
  const s = readTrimmed(fd, key);
  if (!s) return null;
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : null;
}

function readOptionalDate(fd: FormData, key: string): string | null {
  const s = readTrimmed(fd, key);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function forceDuplicate(fd: FormData): boolean {
  return readTrimmed(fd, "force_duplicate") === "1";
}

function formDataToReviewObject(fd: FormData): Record<string, unknown> {
  const keys = [
    "first_name", "last_name", "full_name", "date_of_birth", "age", "sex", "phone", "alternate_phone",
    "address_line_1", "address_line_2", "city", "state", "zip",
    "emergency_contact_1_name", "emergency_contact_1_phone", "emergency_contact_2_name", "emergency_contact_2_phone",
    "referral_source_type", "referral_source_name", "referral_facility",
    "source_contact_name", "source_phone", "source_fax", "source_email", "sales_agent_name",
    "referral_received_date", "requested_soc_date", "best_available_soc_date", "discharge_date",
    "chief_complaint", "diagnosis_text", "diagnosis_code", "prior_medical_history", "allergies", "notes",
    "ordering_physician_name", "ordering_physician_phone", "ordering_physician_fax",
    "pcp_name", "pcp_phone", "pcp_fax", "following_physician_name", "following_physician_phone", "following_physician_fax",
    "insurance_name", "payer_type", "member_id", "medicaid_id", "mbi",
    "authorization_number", "authorization_type", "authorization_bill_type",
    "authorization_effective_start", "authorization_effective_end",
    "skilled_nursing_visits", "pt_visits", "ot_visits", "st_visits", "msw_visits", "hha_visits",
    "approved_disciplines", "denied_disciplines", "total_authorized_visits", "authorization_status",
    "agency_assigned", "assigned_to_saintly", "intake_status", "patient_status", "document_type",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = readTrimmed(fd, k);
  return out;
}

function approvedDisciplinesToArray(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .map((d) => (d === "RN" ? "SN" : d));
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function buildReferralInsert(fd: FormData, parsedJson: ParsedPatientReferralSuggestions | null) {
  const sourceType = readTrimmed(fd, "referral_source_type");
  return {
    referral_source_type: isValidPatientReferralSourceType(sourceType) ? sourceType : "other",
    referral_source_name: readTrimmedOrNull(fd, "referral_source_name"),
    referral_facility: readTrimmedOrNull(fd, "referral_facility"),
    source_contact_name: readTrimmedOrNull(fd, "source_contact_name"),
    source_phone: normalizeReferralPhone(readTrimmed(fd, "source_phone")),
    source_fax: normalizeReferralPhone(readTrimmed(fd, "source_fax")),
    source_email: readTrimmedOrNull(fd, "source_email"),
    sales_agent_name: readTrimmedOrNull(fd, "sales_agent_name"),
    received_date: readOptionalDate(fd, "referral_received_date"),
    requested_soc_date: readOptionalDate(fd, "requested_soc_date"),
    best_available_soc_date: readOptionalDate(fd, "best_available_soc_date"),
    discharge_date: readOptionalDate(fd, "discharge_date"),
    diagnosis_code: readTrimmedOrNull(fd, "diagnosis_code"),
    diagnosis_text: readTrimmedOrNull(fd, "diagnosis_text"),
    chief_complaint: readTrimmedOrNull(fd, "chief_complaint"),
    notes: readTrimmedOrNull(fd, "notes"),
    insurance_name: readTrimmedOrNull(fd, "insurance_name"),
    member_id: readTrimmedOrNull(fd, "member_id"),
    medicaid_id: readTrimmedOrNull(fd, "medicaid_id"),
    mbi: readTrimmedOrNull(fd, "mbi"),
    authorization_number: readTrimmedOrNull(fd, "authorization_number"),
    authorization_type: readTrimmedOrNull(fd, "authorization_type"),
    authorization_bill_type: readTrimmedOrNull(fd, "authorization_bill_type"),
    authorization_effective_start: readOptionalDate(fd, "authorization_effective_start"),
    authorization_effective_end: readOptionalDate(fd, "authorization_effective_end"),
    sn_visits: readOptionalInt(fd, "skilled_nursing_visits"),
    pt_visits: readOptionalInt(fd, "pt_visits"),
    ot_visits: readOptionalInt(fd, "ot_visits"),
    st_visits: readOptionalInt(fd, "st_visits"),
    msw_visits: readOptionalInt(fd, "msw_visits"),
    hha_visits: readOptionalInt(fd, "hha_visits"),
    intake_status: readTrimmed(fd, "intake_status") || DEFAULT_INTAKE_STATUS,
    parse_status: "ready",
    parsed_json: parsedJson,
  };
}

function buildPatientPatch(fd: FormData) {
  const disciplines = approvedDisciplinesToArray(readTrimmed(fd, "approved_disciplines"));
  const manualDisc = parseServiceDisciplinesFromFormData(fd, "service_disciplines");
  const service_disciplines = disciplines.length ? disciplines : manualDisc;

  const patientStatusRaw = readTrimmed(fd, "patient_status");
  const patient_status =
    patientStatusRaw === "active" ||
    patientStatusRaw === "inactive" ||
    patientStatusRaw === "discharged" ||
    patientStatusRaw === "pending"
      ? patientStatusRaw
      : DEFAULT_PATIENT_STATUS;

  return {
    patient_status,
    start_of_care: readOptionalDate(fd, "requested_soc_date") ?? readOptionalDate(fd, "best_available_soc_date"),
    payer_name: readTrimmedOrNull(fd, "insurance_name"),
    payer_type: readTrimmedOrNull(fd, "payer_type"),
    physician_name: readTrimmedOrNull(fd, "ordering_physician_name"),
    referring_provider_name: readTrimmedOrNull(fd, "ordering_physician_name"),
    referring_provider_phone: normalizeReferralPhone(readTrimmed(fd, "ordering_physician_phone")),
    referring_doctor_name: readTrimmedOrNull(fd, "ordering_physician_name"),
    doctor_office_name: readTrimmedOrNull(fd, "referral_facility"),
    doctor_office_phone: normalizeReferralPhone(readTrimmed(fd, "source_phone")),
    referral_source: readTrimmedOrNull(fd, "referral_source_name") ?? readTrimmedOrNull(fd, "referral_facility"),
    intake_status: readTrimmed(fd, "intake_status") || DEFAULT_INTAKE_STATUS,
    service_disciplines,
    service_type: service_disciplines.length ? service_disciplines.join(", ") : null,
    notes: readTrimmedOrNull(fd, "notes"),
  };
}

function buildContactPatch(fd: FormData) {
  const firstName = readTrimmed(fd, "first_name");
  const lastName = readTrimmed(fd, "last_name");
  const fullName =
    readTrimmed(fd, "full_name") || [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  const emergencyMeta: Record<string, string> = {};
  const ec1n = readTrimmed(fd, "emergency_contact_1_name");
  const ec1p = normalizeReferralPhone(readTrimmed(fd, "emergency_contact_1_phone"));
  const ec2n = readTrimmed(fd, "emergency_contact_2_name");
  const ec2p = normalizeReferralPhone(readTrimmed(fd, "emergency_contact_2_phone"));
  if (ec1n) emergencyMeta.emergency_contact_1_name = ec1n;
  if (ec1p) emergencyMeta.emergency_contact_1_phone = ec1p;
  if (ec2n) emergencyMeta.emergency_contact_2_name = ec2n;
  if (ec2p) emergencyMeta.emergency_contact_2_phone = ec2p;

  const allergies = readTrimmed(fd, "allergies");
  const relationship_metadata = {
    ...(Object.keys(emergencyMeta).length ? { emergency_contacts: emergencyMeta } : {}),
    ...(allergies ? { allergies } : {}),
    ...(readTrimmed(fd, "prior_medical_history") ? { prior_medical_history: readTrimmed(fd, "prior_medical_history") } : {}),
  };

  return {
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: fullName,
    primary_phone: normalizePhone(readTrimmed(fd, "phone")) || null,
    secondary_phone: normalizePhone(readTrimmed(fd, "alternate_phone")) || null,
    address_line_1: readTrimmedOrNull(fd, "address_line_1"),
    address_line_2: readTrimmedOrNull(fd, "address_line_2"),
    city: readTrimmedOrNull(fd, "city"),
    state: readTrimmedOrNull(fd, "state"),
    zip: readTrimmedOrNull(fd, "zip"),
    date_of_birth: readOptionalDate(fd, "date_of_birth"),
    relationship_metadata: Object.keys(relationship_metadata).length ? relationship_metadata : undefined,
  };
}

async function uploadReferralFile(
  fd: FormData,
  input: { patientId?: string | null; referralId?: string | null; userId: string | null; referralSourceType: string; documentType: string | null; parsedJson: unknown }
): Promise<{ ok: true; fileId: string } | { ok: false; reason: string }> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, reason: "missing_file" };
  }
  if (file.size > PATIENT_REFERRAL_MAX_BYTES) return { ok: false, reason: "file_too_large" };
  const originalName = file.name || "referral";
  if (!patientReferralHasAllowedExtension(originalName)) return { ok: false, reason: "bad_type" };
  const mime = patientReferralFileMimeFromFile(file);
  if (!isPatientReferralMimeAllowed(mime, originalName)) return { ok: false, reason: "bad_type" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = sanitizePatientReferralFileName(originalName);
  const uploaded = await uploadPatientReferralDocumentToStorage({
    buffer,
    fileName: safeName,
    patientId: input.patientId,
    referralId: input.referralId,
  });
  if (!uploaded.ok) return { ok: false, reason: "upload_failed" };

  const docType =
    input.documentType && isValidPatientReferralDocumentType(input.documentType) ? input.documentType : "referral";

  const { data: fileRow, error } = await supabaseAdmin
    .from("patient_files")
    .insert({
      patient_id: input.patientId ?? null,
      referral_id: input.referralId ?? null,
      uploaded_by: input.userId,
      file_name: safeName,
      file_path: uploaded.storagePath,
      file_type: normalizePatientReferralBaseMime(mime),
      document_type: docType,
      referral_source_type: input.referralSourceType,
      parsed_json: input.parsedJson,
      parse_status: "ready",
    })
    .select("id")
    .single();

  if (error || !fileRow?.id) {
    console.warn("[patient-referral] patient_files insert:", error?.message);
    return { ok: false, reason: "save_failed" };
  }

  return { ok: true, fileId: String(fileRow.id) };
}

function revalidatePatientReferralPaths(patientId?: string | null) {
  revalidatePath("/admin/crm/patients");
  if (patientId) revalidatePath(`/admin/crm/patients/${patientId}`);
}

export type FindPatientReferralDuplicatesResult =
  | { ok: true; duplicates: PatientReferralDuplicateRow[] }
  | { ok: false; reason: "forbidden" | "validation_failed" };

export async function findPatientReferralDuplicatesAction(fd: FormData): Promise<FindPatientReferralDuplicatesResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) return { ok: false, reason: "forbidden" };

  const duplicates = await findPatientReferralDuplicates(supabaseAdmin, {
    first_name: readTrimmedOrNull(fd, "first_name"),
    last_name: readTrimmedOrNull(fd, "last_name"),
    full_name: readTrimmedOrNull(fd, "full_name"),
    date_of_birth: readOptionalDate(fd, "date_of_birth"),
    phone: readTrimmed(fd, "phone"),
    mbi: readTrimmedOrNull(fd, "mbi"),
    member_id: readTrimmedOrNull(fd, "member_id"),
    authorization_number: readTrimmedOrNull(fd, "authorization_number"),
    address_line_1: readTrimmedOrNull(fd, "address_line_1"),
    city: readTrimmedOrNull(fd, "city"),
    state: readTrimmedOrNull(fd, "state"),
    zip: readTrimmedOrNull(fd, "zip"),
    excludePatientId: readTrimmedOrNull(fd, "exclude_patient_id"),
  });

  return { ok: true, duplicates };
}

export type CreatePatientFromReferralResult =
  | { ok: true; patientId: string; referralId: string; message: string }
  | { ok: false; reason: "forbidden" | "validation_failed" | "duplicates" | "missing_file" | "file_too_large" | "bad_type" | "upload_failed" | "save_failed"; duplicates?: PatientReferralDuplicateRow[]; errors?: string[] };

export async function createPatientFromReferral(fd: FormData): Promise<CreatePatientFromReferralResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) return { ok: false, reason: "forbidden" };

  const parsed = patientReferralReviewSchema.safeParse(formDataToReviewObject(fd));
  if (!parsed.success) {
    return {
      ok: false,
      reason: "validation_failed",
      errors: parsed.error.errors.map((e) => e.message),
    };
  }

  if (!forceDuplicate(fd)) {
    const dupRes = await findPatientReferralDuplicatesAction(fd);
    if (dupRes.ok && dupRes.duplicates.length > 0) {
      return { ok: false, reason: "duplicates", duplicates: dupRes.duplicates };
    }
  }

  const userId = await getAuthenticatedUserId();
  const contactPatch = buildContactPatch(fd);
  const { data: contactRow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .insert(contactPatch)
    .select("id")
    .single();

  if (cErr || !contactRow?.id) {
    console.warn("[patient-referral] contact insert:", cErr?.message);
    return { ok: false, reason: "save_failed" };
  }

  const contactId = String(contactRow.id);
  const patientPatch = buildPatientPatch(fd);
  const { data: patientRow, error: pErr } = await supabaseAdmin
    .from("patients")
    .insert({ contact_id: contactId, ...patientPatch })
    .select("id")
    .single();

  if (pErr || !patientRow?.id) {
    await supabaseAdmin.from("contacts").delete().eq("id", contactId);
    console.warn("[patient-referral] patient insert:", pErr?.message);
    return { ok: false, reason: "save_failed" };
  }

  const patientId = String(patientRow.id);
  const parsedJson = (parsed.data as unknown) as ParsedPatientReferralSuggestions;
  const referralInsert = buildReferralInsert(fd, parsedJson);
  const { data: referralRow, error: rErr } = await supabaseAdmin
    .from("patient_referrals")
    .insert({ ...referralInsert, patient_id: patientId })
    .select("id")
    .single();

  if (rErr || !referralRow?.id) {
    console.warn("[patient-referral] referral insert:", rErr?.message);
    return { ok: false, reason: "save_failed" };
  }

  const referralId = String(referralRow.id);
  const fileRes = await uploadReferralFile(fd, {
    patientId,
    referralId,
    userId,
    referralSourceType: referralInsert.referral_source_type,
    documentType: readTrimmedOrNull(fd, "document_type"),
    parsedJson,
  });

  if (!fileRes.ok && fileRes.reason !== "missing_file") {
    console.warn("[patient-referral] file upload after create:", fileRes.reason);
  }

  revalidatePatientReferralPaths(patientId);
  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${contactId}`);

  return { ok: true, patientId, referralId, message: "Patient referral created." };
}

export type AttachReferralToExistingPatientResult =
  | { ok: true; patientId: string; referralId: string; message: string }
  | { ok: false; reason: "forbidden" | "validation_failed" | "not_found" | "missing_file" | "save_failed" | "upload_failed"; errors?: string[] };

export async function attachReferralToExistingPatient(fd: FormData): Promise<AttachReferralToExistingPatientResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) return { ok: false, reason: "forbidden" };

  const patientId = readTrimmed(fd, "existing_patient_id");
  if (!patientId) return { ok: false, reason: "not_found" };

  const parsed = patientReferralReviewSchema.safeParse(formDataToReviewObject(fd));
  if (!parsed.success) {
    return { ok: false, reason: "validation_failed", errors: parsed.error.errors.map((e) => e.message) };
  }

  const { data: patient } = await supabaseAdmin.from("patients").select("id, contact_id").eq("id", patientId).maybeSingle();
  if (!patient?.id || !patient.contact_id) return { ok: false, reason: "not_found" };

  const contactPatch = buildContactPatch(fd);
  const { error: cuErr } = await supabaseAdmin.from("contacts").update(contactPatch).eq("id", patient.contact_id);
  if (cuErr) {
    console.warn("[patient-referral] contact update:", cuErr.message);
    return { ok: false, reason: "save_failed" };
  }

  const patientPatch = buildPatientPatch(fd);
  const { error: puErr } = await supabaseAdmin.from("patients").update(patientPatch).eq("id", patientId);
  if (puErr) {
    console.warn("[patient-referral] patient update:", puErr.message);
    return { ok: false, reason: "save_failed" };
  }

  const userId = await getAuthenticatedUserId();
  const parsedJson = (parsed.data as unknown) as ParsedPatientReferralSuggestions;
  const referralInsert = buildReferralInsert(fd, parsedJson);
  const { data: referralRow, error: rErr } = await supabaseAdmin
    .from("patient_referrals")
    .insert({ ...referralInsert, patient_id: patientId })
    .select("id")
    .single();

  if (rErr || !referralRow?.id) {
    console.warn("[patient-referral] referral attach:", rErr?.message);
    return { ok: false, reason: "save_failed" };
  }

  const referralId = String(referralRow.id);
  await uploadReferralFile(fd, {
    patientId,
    referralId,
    userId,
    referralSourceType: referralInsert.referral_source_type,
    documentType: readTrimmedOrNull(fd, "document_type"),
    parsedJson,
  });

  revalidatePatientReferralPaths(patientId);
  return { ok: true, patientId, referralId, message: "Referral attached to existing patient." };
}

export type SaveReferralOnlyResult =
  | { ok: true; referralId: string; message: string }
  | { ok: false; reason: "forbidden" | "validation_failed" | "save_failed" | "upload_failed"; errors?: string[] };

export async function savePatientReferralOnly(fd: FormData): Promise<SaveReferralOnlyResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) return { ok: false, reason: "forbidden" };

  const parsed = patientReferralReviewSchema.safeParse(formDataToReviewObject(fd));
  if (!parsed.success) {
    return { ok: false, reason: "validation_failed", errors: parsed.error.errors.map((e) => e.message) };
  }

  const userId = await getAuthenticatedUserId();
  const parsedJson = (parsed.data as unknown) as ParsedPatientReferralSuggestions;
  const referralInsert = buildReferralInsert(fd, parsedJson);
  const { data: referralRow, error: rErr } = await supabaseAdmin
    .from("patient_referrals")
    .insert({ ...referralInsert, patient_id: null, parse_status: "needs_review" })
    .select("id")
    .single();

  if (rErr || !referralRow?.id) {
    console.warn("[patient-referral] referral only:", rErr?.message);
    return { ok: false, reason: "save_failed" };
  }

  const referralId = String(referralRow.id);
  await uploadReferralFile(fd, {
    referralId,
    userId,
    referralSourceType: referralInsert.referral_source_type,
    documentType: readTrimmedOrNull(fd, "document_type"),
    parsedJson,
  });

  revalidatePath("/admin/crm/patients");
  return { ok: true, referralId, message: "Referral saved without creating a patient." };
}

export type ParsePatientReferralDocumentActionResult =
  | { ok: true; file_name: string; parse: PatientReferralParsePayload }
  | { ok: false; error: string };

/** Parse referral document via server action (preferred over fetch for session auth). */
export async function parsePatientReferralDocument(
  formData: FormData
): Promise<ParsePatientReferralDocumentActionResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "You do not have access to this action." };
  }

  const result = await parsePatientReferralDocumentFromFormData(formData);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, file_name: result.file_name, parse: result.parse };
}

export async function getPatientReferralFileSignedUrl(
  storagePath: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "Forbidden" };
  }

  const path = storagePath.trim();
  if (!path || path.includes("..") || path.startsWith("/")) {
    return { ok: false, error: "Invalid path" };
  }

  const url = await createPatientReferralSignedUrl(path, 3600);
  if (!url) {
    return { ok: false, error: "Could not open file" };
  }

  return { ok: true, url };
}
