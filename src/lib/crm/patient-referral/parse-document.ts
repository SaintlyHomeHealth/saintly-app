import "server-only";

import { runPatientReferralExtractPipeline } from "./extract-pipeline";
import { isValidPatientReferralSourceType, type PatientReferralSourceType } from "./options";
import type { PatientReferralParsePayload } from "./types";
import {
  isPatientReferralMimeAllowed,
  normalizePatientReferralBaseMime,
  patientReferralFileMimeFromFile,
  patientReferralHasAllowedExtension,
  PATIENT_REFERRAL_HARD_ERROR_CHOOSE_FILE,
  PATIENT_REFERRAL_HARD_ERROR_INVALID_FILE,
  PATIENT_REFERRAL_HARD_ERROR_TOO_LARGE,
  PATIENT_REFERRAL_MAX_BYTES,
  sanitizePatientReferralFileName,
} from "./upload-mime";

export type ParsePatientReferralDocumentResult =
  | {
      ok: true;
      file_name: string;
      referral_source_type: PatientReferralSourceType;
      parse: PatientReferralParsePayload;
    }
  | { ok: false; error: string };

async function readFileFromFormData(formData: FormData): Promise<
  | {
      buffer: Buffer;
      safeName: string;
      baseMime: string;
      originalName: string;
    }
  | { error: string }
> {
  const entry = formData.get("file");
  if (!entry || typeof entry === "string") {
    return { error: PATIENT_REFERRAL_HARD_ERROR_CHOOSE_FILE };
  }
  if (!(entry instanceof Blob)) {
    return { error: PATIENT_REFERRAL_HARD_ERROR_CHOOSE_FILE };
  }

  const originalName = entry instanceof File && entry.name ? entry.name : "referral.pdf";
  if (!patientReferralHasAllowedExtension(originalName)) {
    return { error: PATIENT_REFERRAL_HARD_ERROR_INVALID_FILE };
  }

  const mime = entry instanceof File ? patientReferralFileMimeFromFile(entry) : "application/octet-stream";
  if (!isPatientReferralMimeAllowed(mime, originalName)) {
    return { error: PATIENT_REFERRAL_HARD_ERROR_INVALID_FILE };
  }

  const arrayBuffer = await entry.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length <= 0) {
    return { error: PATIENT_REFERRAL_HARD_ERROR_CHOOSE_FILE };
  }
  if (buffer.length > PATIENT_REFERRAL_MAX_BYTES) {
    return { error: PATIENT_REFERRAL_HARD_ERROR_TOO_LARGE };
  }

  return {
    buffer,
    safeName: sanitizePatientReferralFileName(originalName),
    baseMime: normalizePatientReferralBaseMime(mime),
    originalName,
  };
}

export async function parsePatientReferralDocumentFromFormData(
  formData: FormData
): Promise<ParsePatientReferralDocumentResult> {
  const referralSourceRaw = formData.get("referral_source_type");
  const trimmedSource = typeof referralSourceRaw === "string" ? referralSourceRaw.trim() : "";
  if (!isValidPatientReferralSourceType(trimmedSource)) {
    return { ok: false, error: "Select a referral source before uploading." };
  }
  const referralSourceType = trimmedSource;

  const fileRead = await readFileFromFormData(formData);
  if ("error" in fileRead) {
    return { ok: false, error: fileRead.error };
  }

  const { buffer, safeName, baseMime, originalName } = fileRead;

  if (process.env.PATIENT_REFERRAL_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development") {
    console.info("[patient-referral] incoming file", {
      originalName,
      safeName,
      fileSize: buffer.length,
      mimeType: baseMime,
    });
  }

  let parseOut: PatientReferralParsePayload;
  try {
    parseOut = await runPatientReferralExtractPipeline(buffer, safeName, {
      mimeType: baseMime,
      referralSourceType,
    });

    if (parseOut.suggestions && !parseOut.suggestions.referral_source_type) {
      parseOut.suggestions.referral_source_type = referralSourceType;
    }
  } catch (e) {
    console.error("[patient-referral] parse document:", e);
    const msg = e instanceof Error ? e.message : "Parse failed";
    parseOut = {
      ok: false,
      quality: "manual",
      suggestions: null,
      messages: [msg],
      statusHeadline: msg,
    };
  }

  return {
    ok: true,
    file_name: safeName,
    referral_source_type: referralSourceType,
    parse: parseOut,
  };
}
