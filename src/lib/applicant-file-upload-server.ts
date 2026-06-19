import { supabaseAdmin } from "@/lib/admin";
import {
  APPLICANT_FILE_UPLOAD_ACCEPTED_MIME_TYPES,
  APPLICANT_FILE_UPLOAD_ALLOWED_DOCUMENT_TYPES,
  formatMimeTypeForError,
  getEffectiveApplicantUploadMime,
  inferApplicantUploadMimeFromFileName,
  isAllowedApplicantUploadDocumentType,
  normalizeApplicantUploadDocumentType,
} from "@/lib/applicant-file-upload-types";

const ALLOWED_TYPES = [...APPLICANT_FILE_UPLOAD_ACCEPTED_MIME_TYPES];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export type ApplicantFileUploadSuccess = {
  success: true;
  file: Record<string, unknown>;
};

export type ApplicantFileUploadFailure = {
  success: false;
  status: number;
  body: Record<string, unknown>;
};

export type ApplicantFileUploadResult = ApplicantFileUploadSuccess | ApplicantFileUploadFailure;

export async function processApplicantFileUpload(
  formData: FormData
): Promise<ApplicantFileUploadResult> {
  const applicantId = formData.get("applicantId")?.toString();
  const documentTypeRaw = formData.get("documentType")?.toString();
  const displayName = formData.get("displayName")?.toString() || "";
  const documentType = documentTypeRaw ? normalizeApplicantUploadDocumentType(documentTypeRaw) : "";
  const ALLOWED_DOCUMENT_TYPES = [...APPLICANT_FILE_UPLOAD_ALLOWED_DOCUMENT_TYPES];

  if (!isAllowedApplicantUploadDocumentType(documentTypeRaw || "")) {
    return {
      success: false,
      status: 400,
      body: {
        code: "invalid_document_type",
        error: `Invalid document type "${documentType || "(empty)"}". Allowed types: ${ALLOWED_DOCUMENT_TYPES.join(", ")}.`,
        receivedDocumentType: documentTypeRaw?.trim() || documentType || null,
        allowedDocumentTypes: ALLOWED_DOCUMENT_TYPES,
      },
    };
  }

  const required = formData.get("required")?.toString() === "true";
  const completeComplianceEventId = formData.get("completeComplianceEventId")?.toString() || null;
  const file = formData.get("file") as File | null;

  if (!applicantId || !documentType || !file) {
    return {
      success: false,
      status: 400,
      body: { error: "Missing applicantId, documentType, or file" },
    };
  }

  const effectiveMime = getEffectiveApplicantUploadMime(file);

  if (documentType === "headshot" && !effectiveMime.toLowerCase().startsWith("image/")) {
    return {
      success: false,
      status: 400,
      body: {
        code: "invalid_mime_type",
        error:
          "Professional headshots must be a photo (JPEG, PNG, WEBP, or HEIC). PDF files are not accepted.",
        receivedMimeType: file.type,
        acceptedMimeTypes: ALLOWED_TYPES.filter((t) => t.startsWith("image/")),
      },
    };
  }

  if (!(ALLOWED_TYPES as readonly string[]).includes(effectiveMime)) {
    return {
      success: false,
      status: 400,
      body: {
        code: "invalid_mime_type",
        error: `This file type is not accepted (${formatMimeTypeForError(file.type)}). Allowed: PDF, JPEG, PNG, WEBP, HEIC.`,
        receivedMimeType: file.type,
        inferredMimeType: inferApplicantUploadMimeFromFileName(file.name),
        acceptedMimeTypes: [...ALLOWED_TYPES],
      },
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      status: 400,
      body: { error: "File too large. Max size is 10MB." },
    };
  }

  const safeName = sanitizeFileName(file.name);
  const timestamp = Date.now();
  const filePath = `applicants/${applicantId}/${documentType}-${timestamp}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("applicant-files")
    .upload(filePath, buffer, {
      contentType: effectiveMime,
      upsert: false,
    });

  if (uploadError) {
    return {
      success: false,
      status: 500,
      body: { error: uploadError.message },
    };
  }

  const { data: insertedFile, error: insertError } = await supabaseAdmin
    .from("applicant_files")
    .insert({
      applicant_id: applicantId,
      document_type: documentType,
      display_name: displayName || file.name,
      file_name: file.name,
      file_path: filePath,
      storage_path: filePath,
      file_type: effectiveMime,
      file_size: file.size,
      required,
    })
    .select()
    .single();

  if (insertError) {
    return {
      success: false,
      status: 500,
      body: { error: insertError.message },
    };
  }

  if (documentType === "auto_insurance") {
    const { error: applicantUpdateError } = await supabaseAdmin
      .from("applicants")
      .update({ auto_insurance_file: filePath, updated_at: new Date().toISOString() })
      .eq("id", applicantId);

    if (applicantUpdateError) {
      return {
        success: false,
        status: 500,
        body: { error: applicantUpdateError.message },
      };
    }
  }

  if (documentType === "headshot") {
    const { error: applicantUpdateError } = await supabaseAdmin
      .from("applicants")
      .update({ headshot_file: filePath, updated_at: new Date().toISOString() })
      .eq("id", applicantId);

    if (applicantUpdateError) {
      return {
        success: false,
        status: 500,
        body: { error: applicantUpdateError.message },
      };
    }
  }

  if (completeComplianceEventId) {
    const { error: eventUpdateError } = await supabaseAdmin
      .from("admin_compliance_events")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", completeComplianceEventId);

    if (eventUpdateError) {
      return {
        success: false,
        status: 500,
        body: { error: eventUpdateError.message },
      };
    }
  }

  return {
    success: true,
    file: insertedFile as Record<string, unknown>,
  };
}
