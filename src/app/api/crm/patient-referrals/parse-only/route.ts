import { NextResponse } from "next/server";

import { runPatientReferralExtractPipeline } from "@/lib/crm/patient-referral/extract-pipeline";
import type { PatientReferralParsePayload } from "@/lib/crm/patient-referral/types";
import {
  isPatientReferralMimeAllowed,
  normalizePatientReferralBaseMime,
  patientReferralFileMimeFromFile,
  patientReferralHasAllowedExtension,
  PATIENT_REFERRAL_HARD_ERROR_CHOOSE_FILE,
  PATIENT_REFERRAL_HARD_ERROR_INVALID_FILE,
  PATIENT_REFERRAL_HARD_ERROR_TOO_LARGE,
  PATIENT_REFERRAL_MAX_BYTES,
  PATIENT_REFERRAL_SOFT_MANUAL_PARSE,
  sanitizePatientReferralFileName,
} from "@/lib/crm/patient-referral/upload-mime";
import { isValidPatientReferralSourceType, type PatientReferralSourceType } from "@/lib/crm/patient-referral/options";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = (await req.formData().catch(() => null)) as globalThis.FormData | null;
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const referralSourceRaw = formData.get("referral_source_type");
  const trimmedSource = typeof referralSourceRaw === "string" ? referralSourceRaw.trim() : "";
  let referralSourceType: PatientReferralSourceType | null = null;
  if (isValidPatientReferralSourceType(trimmedSource)) {
    referralSourceType = trimmedSource;
  }

  if (!referralSourceType) {
    return NextResponse.json({ error: "Select a referral source before uploading." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: PATIENT_REFERRAL_HARD_ERROR_CHOOSE_FILE }, { status: 400 });
  }

  if (file.size > PATIENT_REFERRAL_MAX_BYTES) {
    return NextResponse.json({ error: PATIENT_REFERRAL_HARD_ERROR_TOO_LARGE }, { status: 400 });
  }

  const originalName = file.name || "referral";
  if (!patientReferralHasAllowedExtension(originalName)) {
    return NextResponse.json({ error: PATIENT_REFERRAL_HARD_ERROR_INVALID_FILE }, { status: 400 });
  }

  const mime = patientReferralFileMimeFromFile(file);
  if (!isPatientReferralMimeAllowed(mime, originalName)) {
    return NextResponse.json({ error: PATIENT_REFERRAL_HARD_ERROR_INVALID_FILE }, { status: 400 });
  }

  const safeName = sanitizePatientReferralFileName(originalName);
  const baseMime = normalizePatientReferralBaseMime(mime);

  let parseOut: PatientReferralParsePayload;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    parseOut = await runPatientReferralExtractPipeline(buffer, safeName, {
      mimeType: baseMime,
      referralSourceType,
    });
    if (!parseOut.suggestions) {
      parseOut.suggestions = {
        referral_source_type: referralSourceType,
        intake_status: "New Referral",
        patient_status: "pending",
      };
    } else if (!parseOut.suggestions.referral_source_type) {
      parseOut.suggestions.referral_source_type = referralSourceType;
    }
  } catch (e) {
    console.error("[patient-referral/parse-only] unexpected error", e);
    parseOut = {
      ok: false,
      quality: "manual",
      suggestions: {
        referral_source_type: referralSourceType,
        intake_status: "New Referral",
        patient_status: "pending",
      },
      messages: [PATIENT_REFERRAL_SOFT_MANUAL_PARSE],
    };
  }

  return NextResponse.json({
    ok: true,
    file_name: safeName,
    referral_source_type: referralSourceType,
    parse: parseOut,
  });
}
