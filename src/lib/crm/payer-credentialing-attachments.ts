import { createHash } from "node:crypto";

/** Next.js server action body limit (see next.config.ts). */
export const PAYER_CREDENTIALING_MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024;

/** Leave room for multipart boundaries and text fields in a server-action POST. */
export const PAYER_CREDENTIALING_REQUEST_BODY_HEADROOM_BYTES = 512 * 1024;

export function computeAttachmentSha256(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export type AttachmentFallbackFingerprint = {
  fileName: string;
  fileSize: number;
  fileType: string;
};

export function attachmentFallbackKey(fp: AttachmentFallbackFingerprint): string {
  const name = fp.fileName.trim().toLowerCase();
  const type = fp.fileType.trim().toLowerCase();
  return `${name}\0${fp.fileSize}\0${type}`;
}

export function maxCredentialingUploadBatchBytes(): number {
  return PAYER_CREDENTIALING_MAX_REQUEST_BODY_BYTES - PAYER_CREDENTIALING_REQUEST_BODY_HEADROOM_BYTES;
}

/** Split files into upload batches that stay under the request body limit. */
export function batchItemsByTotalSize<T extends { size: number }>(
  items: T[],
  maxTotalBytes: number
): T[][] {
  if (items.length === 0) return [];
  const batches: T[][] = [];
  let current: T[] = [];
  let currentSize = 0;

  for (const item of items) {
    if (item.size > maxTotalBytes) {
      if (current.length > 0) {
        batches.push(current);
        current = [];
        currentSize = 0;
      }
      batches.push([item]);
      continue;
    }

    if (currentSize + item.size > maxTotalBytes && current.length > 0) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(item);
    currentSize += item.size;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

export type ExistingAttachmentFingerprint = {
  fileHashSha256: string | null;
  fileName: string;
  fileSize: number | null;
  fileType: string | null;
};

export function isDuplicateAgainstExisting(params: {
  hash: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  existing: ExistingAttachmentFingerprint[];
}): boolean {
  const { hash, fileName, fileSize, fileType, existing } = params;
  const fallbackKey = attachmentFallbackKey({ fileName, fileSize, fileType });

  for (const row of existing) {
    if (row.fileHashSha256 && row.fileHashSha256 === hash) return true;
    if (
      row.fileName.trim() &&
      row.fileSize != null &&
      attachmentFallbackKey({
        fileName: row.fileName,
        fileSize: row.fileSize,
        fileType: row.fileType ?? "",
      }) === fallbackKey
    ) {
      return true;
    }
  }

  return false;
}
