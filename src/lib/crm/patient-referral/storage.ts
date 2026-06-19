import "server-only";

import { supabaseAdmin } from "@/lib/admin";

import { guessPatientReferralContentType, sanitizePatientReferralFileName } from "./upload-mime";

export const PATIENT_REFERRAL_DOCUMENTS_BUCKET = "patient-referral-documents";

export async function uploadPatientReferralDocumentToStorage(input: {
  buffer: Buffer;
  fileName: string;
  referralId?: string | null;
  patientId?: string | null;
}): Promise<{ ok: true; storagePath: string; safeName: string } | { ok: false; error: string }> {
  const safeName = sanitizePatientReferralFileName(input.fileName);
  const timestamp = Date.now();
  const prefix = input.patientId?.trim() || input.referralId?.trim() || "intake";
  const storagePath = `${prefix}/${timestamp}-${safeName}`;
  const contentType = guessPatientReferralContentType(safeName);

  const { error } = await supabaseAdmin.storage.from(PATIENT_REFERRAL_DOCUMENTS_BUCKET).upload(storagePath, input.buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.warn("[patient-referral] storage upload:", error.message);
    return { ok: false, error: error.message || "Upload failed" };
  }

  return { ok: true, storagePath, safeName };
}

export async function createPatientReferralSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(PATIENT_REFERRAL_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath.trim(), expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.warn("[patient-referral] signed url:", error?.message);
    return null;
  }
  return data.signedUrl;
}
