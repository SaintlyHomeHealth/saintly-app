import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  PAYER_CREDENTIALING_API_MAX_BATCH_BYTES,
  PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES,
  uploadCredentialingAttachments,
  verifyCredentialingRecordExists,
  type BulkUploadResult,
} from "@/lib/crm/payer-credentialing-attachment-upload";
import { PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES, PAYER_CREDENTIALING_STORAGE_BUCKET } from "@/lib/crm/payer-credentialing-storage";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readOptionalText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function emptyResult(): BulkUploadResult {
  return { ok: false, uploaded: [], skipped: [], failed: [] };
}

/**
 * Controlled credentialing attachment upload (multipart). Client sends one file or a small batch per request.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ credentialingRecordId: string }> }
): Promise<Response> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json(
      {
        ...emptyResult(),
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.forbidden,
        failed: [{ fileName: "—", code: "forbidden", message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.forbidden }],
      },
      { status: 403 }
    );
  }

  const { credentialingRecordId: rawId } = await ctx.params;
  const credentialingId = typeof rawId === "string" ? rawId.trim() : "";
  if (!UUID_RE.test(credentialingId)) {
    return NextResponse.json(
      {
        ...emptyResult(),
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.invalid_record,
        failed: [
          { fileName: "—", code: "invalid_record", message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.invalid_record },
        ],
      },
      { status: 400 }
    );
  }

  if (!PAYER_CREDENTIALING_STORAGE_BUCKET?.trim()) {
    console.error("[credentialing] upload API: storage bucket not configured");
    return NextResponse.json(
      {
        ...emptyResult(),
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.bucket_config,
        failed: [
          { fileName: "—", code: "bucket_config", message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.bucket_config },
        ],
      },
      { status: 500 }
    );
  }

  if (!(await verifyCredentialingRecordExists(credentialingId))) {
    return NextResponse.json(
      {
        ...emptyResult(),
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.record,
        failed: [{ fileName: "—", code: "record", message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.record }],
      },
      { status: 404 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    console.warn("[credentialing] upload API formData parse failed:", credentialingId, err);
    return NextResponse.json(
      {
        ...emptyResult(),
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.body_too_large,
        failed: [
          { fileName: "—", code: "body_too_large", message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.body_too_large },
        ],
      },
      { status: 413 }
    );
  }

  const batchNumberRaw = formData.get("batch_number");
  const batchNumber =
    typeof batchNumberRaw === "string" && batchNumberRaw.trim() ? Number.parseInt(batchNumberRaw, 10) : undefined;

  const rawFiles = formData.getAll("files");
  const fileEntries: File[] = [];
  for (const entry of rawFiles) {
    if (entry instanceof File && entry.size > 0) fileEntries.push(entry);
  }

  if (fileEntries.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        uploaded: [],
        skipped: [],
        failed: [{ fileName: "—", code: "missing_file", message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.missing_file }],
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.missing_file,
      },
      { status: 400 }
    );
  }

  let batchBytes = 0;
  for (const f of fileEntries) {
    batchBytes += f.size;
    if (f.size > PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          uploaded: [],
          skipped: [],
          failed: [
            {
              fileName: f.name,
              code: "too_large",
              message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.too_large,
            },
          ],
          message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.too_large,
        },
        { status: 400 }
      );
    }
  }

  if (batchBytes > PAYER_CREDENTIALING_API_MAX_BATCH_BYTES) {
    console.warn(
      "[credentialing] upload API batch too large:",
      `record=${credentialingId}`,
      `batch=${batchNumber ?? "?"}`,
      `files=${fileEntries.length}`,
      `bytes=${batchBytes}`
    );
    return NextResponse.json(
      {
        ok: false,
        uploaded: [],
        skipped: [],
        failed: [
          {
            fileName: "—",
            code: "batch_too_large",
            message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.batch_too_large,
          },
        ],
        message: PAYER_CREDENTIALING_UPLOAD_USER_MESSAGES.batch_too_large,
      },
      { status: 413 }
    );
  }

  const category = readOptionalText(formData, "attachment_category");
  const description = readOptionalText(formData, "attachment_description");

  const inputs = await Promise.all(
    fileEntries.map(async (file) => ({
      name: file.name,
      size: file.size,
      mimeHint: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    }))
  );

  const result = await uploadCredentialingAttachments({
    credentialingId,
    staffUserId: staff.user_id,
    files: inputs,
    category,
    description,
    logContext: { batchNumber },
  });

  if (result.uploaded.length > 0) {
    revalidatePath("/admin/credentialing");
    revalidatePath(`/admin/credentialing/${credentialingId}`);
  }

  const status = result.failed.some((f) => f.code === "forbidden") ? 403 : result.failed.length > 0 && result.uploaded.length === 0 ? 400 : 200;
  return NextResponse.json(result, { status });
}
