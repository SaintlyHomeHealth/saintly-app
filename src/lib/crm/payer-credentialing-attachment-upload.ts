import { randomUUID } from "node:crypto";

import { PAYER_CREDENTIALING_ACTIVITY_TYPES } from "@/lib/crm/credentialing-activity-types";
import {
  computeAttachmentSha256,
  isDuplicateAgainstExisting,
  PAYER_CREDENTIALING_API_MAX_BATCH_BYTES,
  type ExistingAttachmentFingerprint,
} from "@/lib/crm/payer-credentialing-attachments";
import {
  isAllowedPayerCredentialingMime,
  PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES,
  PAYER_CREDENTIALING_STORAGE_BUCKET,
  sanitizePayerCredentialingFileName,
} from "@/lib/crm/payer-credentialing-storage";
import { supabaseAdmin } from "@/lib/admin";

export { PAYER_CREDENTIALING_API_MAX_BATCH_BYTES };

export const PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES: Record<string, string> = {
  missing_file: "Choose a file to upload.",
  too_large: `File is too large (max ${Math.round(PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB).`,
  type: "That file type is not allowed. Use PDF, images, Word, Excel, CSV, TXT, or ZIP.",
  record: "Could not verify this payer record.",
  storage: "Storage upload failed. Check the payer-credentialing bucket and policies.",
  db: "Saved to storage but database insert failed; the file was removed from storage.",
  bucket_config: "Storage bucket is not configured.",
  forbidden: "You do not have permission to upload.",
  invalid_record: "Invalid credentialing record.",
  duplicate: "This file is already attached to this carrier.",
  batch_too_large: "Upload batch is too large. Try fewer files at a time.",
  body_too_large: "Request body is too large for the server.",
  auth: "Your session expired. Sign in again and retry.",
  unexpected: "Something went wrong during upload. Please try again.",
};

export type BulkUploadResult = {
  ok: boolean;
  uploaded: Array<{ fileName: string; attachmentId?: string }>;
  skipped: Array<{ fileName: string; code: string; message: string }>;
  failed: Array<{ fileName: string; code: string; message: string }>;
  message?: string;
};

export type CredentialingAttachmentUploadInput = {
  name: string;
  size: number;
  mimeHint: string;
  buffer: Buffer;
};

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

export function effectiveCredentialingAttachmentMime(name: string, mimeHint: string): string {
  const t = mimeHint.trim().toLowerCase();
  if (t) return t;
  return inferMimeFromFileName(name);
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

export async function loadExistingCredentialingAttachmentFingerprints(
  credentialingId: string
): Promise<ExistingAttachmentFingerprint[]> {
  const { data, error } = await supabaseAdmin
    .from("payer_credentialing_attachments")
    .select("file_hash_sha256, file_name, file_size, file_type")
    .eq("credentialing_record_id", credentialingId);

  if (error) {
    console.warn("[credentialing] attachment fingerprint fetch:", credentialingId, error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    fileHashSha256:
      typeof row.file_hash_sha256 === "string" && row.file_hash_sha256.trim()
        ? row.file_hash_sha256.trim()
        : null,
    fileName: typeof row.file_name === "string" ? row.file_name : "",
    fileSize: typeof row.file_size === "number" ? row.file_size : null,
    fileType: typeof row.file_type === "string" ? row.file_type : null,
  }));
}

async function uploadOneCredentialingAttachmentBuffer(params: {
  credentialingId: string;
  staffUserId: string;
  file: CredentialingAttachmentUploadInput;
  category: string | null;
  description: string | null;
  existingFingerprints: ExistingAttachmentFingerprint[];
  logContext?: { batchNumber?: number };
}): Promise<
  | { ok: true; fileName: string; attachmentId: string }
  | { ok: false; fileName: string; code: string; message: string; duplicate?: boolean }
> {
  const { credentialingId, staffUserId, file, category, description, existingFingerprints, logContext } =
    params;
  const displayName = typeof file.name === "string" && file.name.trim() ? file.name : "file";
  const batchLabel = logContext?.batchNumber != null ? ` batch=${logContext.batchNumber}` : "";

  try {
    if (file.size < 1 || file.buffer.length < 1) {
      return {
        ok: false,
        fileName: displayName,
        code: "missing_file",
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.missing_file,
      };
    }
    if (file.size > PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES || file.buffer.length > PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        fileName: displayName,
        code: "too_large",
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.too_large,
      };
    }

    const mime = effectiveCredentialingAttachmentMime(displayName, file.mimeHint);
    if (!mime || !isAllowedPayerCredentialingMime(mime)) {
      console.warn(
        "[credentialing] attachment type rejected:",
        `record=${credentialingId}${batchLabel}`,
        `file=${displayName}`,
        `size=${file.size}`,
        `mime=${mime || "(empty)"}`
      );
      return {
        ok: false,
        fileName: displayName,
        code: "type",
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.type,
      };
    }

    const fileHashSha256 = computeAttachmentSha256(file.buffer);

    if (
      isDuplicateAgainstExisting({
        hash: fileHashSha256,
        fileName: displayName,
        fileSize: file.size,
        fileType: mime,
        existing: existingFingerprints,
      })
    ) {
      return {
        ok: false,
        fileName: displayName,
        code: "duplicate",
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.duplicate,
        duplicate: true,
      };
    }

    const safeName = sanitizePayerCredentialingFileName(displayName);
    let attachmentId = randomUUID();
    let storagePath = `${credentialingId}/${attachmentId}/${safeName}`;
    let { error: upErr } = await supabaseAdmin.storage
      .from(PAYER_CREDENTIALING_STORAGE_BUCKET)
      .upload(storagePath, file.buffer, {
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
          .upload(storagePath, file.buffer, {
            contentType: mime,
            upsert: false,
          }));
      }
    }

    if (upErr) {
      console.warn(
        "[credentialing] attachment storage upload failed:",
        `record=${credentialingId}${batchLabel}`,
        `file=${displayName}`,
        `size=${file.size}`,
        `mime=${mime}`,
        upErr.message
      );
      return {
        ok: false,
        fileName: displayName,
        code: "storage",
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.storage,
      };
    }

    const { error: insErr } = await supabaseAdmin.from("payer_credentialing_attachments").insert({
      id: attachmentId,
      credentialing_record_id: credentialingId,
      storage_path: storagePath,
      file_name: displayName,
      file_type: mime,
      file_size: file.size,
      file_hash_sha256: fileHashSha256,
      category,
      description,
      uploaded_by_user_id: staffUserId,
    });

    if (insErr) {
      console.warn(
        "[credentialing] attachment insert failed:",
        `record=${credentialingId}${batchLabel}`,
        `file=${displayName}`,
        `size=${file.size}`,
        `mime=${mime}`,
        `code=${insErr.code ?? ""}`,
        insErr.message
      );
      const { error: rmErr } = await supabaseAdmin.storage
        .from(PAYER_CREDENTIALING_STORAGE_BUCKET)
        .remove([storagePath]);
      if (rmErr) {
        console.error("[credentialing] orphan storage after failed DB insert:", storagePath, rmErr.message);
      }
      const isDuplicate =
        insErr.code === "23505" ||
        (insErr.message ?? "").toLowerCase().includes("duplicate") ||
        (insErr.message ?? "").toLowerCase().includes("unique");
      if (isDuplicate) {
        return {
          ok: false,
          fileName: displayName,
          code: "duplicate",
          message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.duplicate,
          duplicate: true,
        };
      }
      return {
        ok: false,
        fileName: displayName,
        code: "db",
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.db,
      };
    }

    existingFingerprints.push({
      fileHashSha256: fileHashSha256,
      fileName: displayName,
      fileSize: file.size,
      fileType: mime,
    });

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
    console.error(
      "[credentialing] uploadOneCredentialingAttachmentBuffer:",
      `record=${credentialingId}${batchLabel}`,
      `file=${displayName}`,
      `size=${file.size}`,
      err
    );
    return {
      ok: false,
      fileName: displayName,
      code: "unexpected",
      message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.unexpected,
    };
  }
}

function summarizeBulkUploadResult(
  uploaded: BulkUploadResult["uploaded"],
  skipped: BulkUploadResult["skipped"],
  failed: BulkUploadResult["failed"]
): BulkUploadResult {
  const allOk = failed.length === 0 && uploaded.length > 0;
  let message: string | undefined;
  if (uploaded.length > 0 && failed.length > 0) {
    message = `${uploaded.length} file(s) uploaded; ${failed.length} failed.`;
  } else if (uploaded.length === 0 && failed.length > 0 && skipped.length === 0) {
    message = "No files were uploaded.";
  } else if (uploaded.length > 0) {
    message =
      uploaded.length === 1
        ? "Attachment uploaded successfully."
        : `${uploaded.length} attachments uploaded successfully.`;
  }
  if (skipped.length > 0) {
    const skipNote =
      skipped.length === 1 ? "Skipped 1 duplicate file." : `Skipped ${skipped.length} duplicate files.`;
    message = message ? `${message} ${skipNote}` : skipNote;
  }

  return { ok: allOk, uploaded, skipped, failed, message };
}

export async function uploadCredentialingAttachments(params: {
  credentialingId: string;
  staffUserId: string;
  files: CredentialingAttachmentUploadInput[];
  category: string | null;
  description: string | null;
  existingFingerprints?: ExistingAttachmentFingerprint[];
  logContext?: { batchNumber?: number };
}): Promise<BulkUploadResult> {
  const {
    credentialingId,
    staffUserId,
    files,
    category,
    description,
    logContext,
  } = params;

  const existingFingerprints =
    params.existingFingerprints ?? (await loadExistingCredentialingAttachmentFingerprints(credentialingId));

  const uploaded: BulkUploadResult["uploaded"] = [];
  const skipped: BulkUploadResult["skipped"] = [];
  const failed: BulkUploadResult["failed"] = [];

  for (const file of files) {
    const result = await uploadOneCredentialingAttachmentBuffer({
      credentialingId,
      staffUserId,
      file,
      category,
      description,
      existingFingerprints,
      logContext,
    });
    if (result.ok) {
      uploaded.push({ fileName: result.fileName, attachmentId: result.attachmentId });
    } else if ("duplicate" in result && result.duplicate) {
      skipped.push({ fileName: result.fileName, code: result.code, message: result.message });
    } else {
      failed.push({ fileName: result.fileName, code: result.code, message: result.message });
    }
  }

  return summarizeBulkUploadResult(uploaded, skipped, failed);
}

export async function verifyCredentialingRecordExists(credentialingId: string): Promise<boolean> {
  const { data: record, error } = await supabaseAdmin
    .from("payer_credentialing_records")
    .select("id")
    .eq("id", credentialingId)
    .maybeSingle();

  if (error) {
    console.warn("[credentialing] upload record fetch:", credentialingId, error.message);
    return false;
  }
  return Boolean(record?.id);
}
