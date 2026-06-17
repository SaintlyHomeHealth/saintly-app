"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { BulkUploadResult } from "@/lib/crm/payer-credentialing-attachment-upload";
import {
  batchItemsByTotalSize,
  isDuplicateAgainstExisting,
  maxCredentialingClientUploadBatchBytes,
  PAYER_CREDENTIALING_CLIENT_FILES_PER_REQUEST,
  type ExistingAttachmentFingerprint,
} from "@/lib/crm/payer-credentialing-attachments";
import { hashFileSha256 } from "@/lib/crm/payer-credentialing-attachments-client";
import { PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES } from "@/lib/crm/payer-credentialing-storage";

const inp =
  "mt-0.5 w-full max-w-lg rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

const MAX_MB = Math.round(PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES / (1024 * 1024));

type PreparedFile = {
  file: File;
  hash: string;
  size: number;
};

function uploadApiUrl(credentialingId: string): string {
  return `/api/admin/credentialing/${encodeURIComponent(credentialingId)}/attachments/upload`;
}

function mergeUploadResults(target: BulkUploadResult, batch: BulkUploadResult): BulkUploadResult {
  return {
    ok: target.ok && batch.ok,
    uploaded: [...target.uploaded, ...batch.uploaded],
    skipped: [...target.skipped, ...batch.skipped],
    failed: [...target.failed, ...batch.failed],
    message: batch.message ?? target.message,
  };
}

function buildSummaryMessage(result: BulkUploadResult): string | undefined {
  const parts: string[] = [];
  if (result.uploaded.length > 0) {
    parts.push(
      result.uploaded.length === 1
        ? "Attachment uploaded successfully."
        : `${result.uploaded.length} attachments uploaded successfully.`
    );
  }
  if (result.failed.length > 0 && result.uploaded.length > 0) {
    parts.push(`${result.failed.length} file(s) failed.`);
  } else if (result.failed.length > 0 && result.uploaded.length === 0 && result.skipped.length === 0) {
    parts.push("No files were uploaded.");
  }
  if (result.skipped.length > 0) {
    parts.push(
      result.skipped.length === 1 ? "Skipped 1 duplicate file." : `Skipped ${result.skipped.length} duplicate files.`
    );
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function httpStatusMessage(status: number): string {
  if (status === 401 || status === 403) return "You do not have permission to upload (sign in again if needed).";
  if (status === 413) return "Request too large for the server. The app uploads one file at a time; contact support if this persists.";
  if (status >= 500) return "Server error during upload. Try again in a moment.";
  return `Upload request failed (HTTP ${status}).`;
}

async function postUploadBatch(params: {
  credentialingId: string;
  files: PreparedFile[];
  category: string | null;
  description: string | null;
  batchNumber: number;
}): Promise<BulkUploadResult> {
  const { credentialingId, files, category, description, batchNumber } = params;
  const batchFd = new FormData();
  batchFd.set("batch_number", String(batchNumber));
  if (category) batchFd.set("attachment_category", category);
  if (description) batchFd.set("attachment_description", description);
  for (const item of files) {
    batchFd.append("files", item.file, item.file.name);
  }

  const batchBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (process.env.NODE_ENV !== "production") {
    console.debug("[credentialing upload] POST batch", {
      batchNumber,
      fileCount: files.length,
      batchBytes,
      files: files.map((f) => ({ name: f.file.name, size: f.size, type: f.file.type })),
    });
  }

  let res: Response;
  try {
    res = await fetch(uploadApiUrl(credentialingId), { method: "POST", body: batchFd });
  } catch (err) {
    console.error("[credentialing upload] network error:", batchNumber, err);
    throw new Error("Network error during upload. Check your connection and try again.");
  }

  let data: BulkUploadResult | null = null;
  try {
    data = (await res.json()) as BulkUploadResult;
  } catch {
    console.error("[credentialing upload] non-JSON response:", batchNumber, res.status);
    throw new Error(httpStatusMessage(res.status));
  }

  if (!data) {
    throw new Error(httpStatusMessage(res.status));
  }

  if (!res.ok && data.failed.length === 0 && data.uploaded.length === 0) {
    const msg = data.message ?? data.failed[0]?.message ?? httpStatusMessage(res.status);
    throw new Error(msg);
  }

  return data;
}

export function CredentialingAttachmentUploadForm({
  credentialingId,
  existingAttachments,
}: {
  credentialingId: string;
  existingAttachments: ExistingAttachmentFingerprint[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const knownFingerprintsRef = useRef<ExistingAttachmentFingerprint[]>([]);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [state, setState] = useState<BulkUploadResult | null>(null);

  async function handleUploadClick() {
    setClientError(null);
    setState(null);

    const input = fileInputRef.current;
    const rawFiles = input?.files ? Array.from(input.files).filter((f) => f.size > 0) : [];
    if (rawFiles.length === 0) {
      setClientError("Choose at least one file to upload.");
      return;
    }

    for (const f of rawFiles) {
      if (f.size > PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES) {
        setClientError(
          `"${f.name}" is over ${MAX_MB} MB. Split the file or choose a smaller file (max ${MAX_MB} MB per file).`
        );
        return;
      }
    }

    const categoryVal = category.trim() || null;
    const descriptionVal = description.trim() || null;

    setIsPending(true);
    knownFingerprintsRef.current = existingAttachments.map((row) => ({ ...row }));
    const total = rawFiles.length;
    setProgress({ current: 0, total });

    if (process.env.NODE_ENV !== "production") {
      console.debug("[credentialing upload] selected", {
        totalFiles: total,
        totalBytes: rawFiles.reduce((s, f) => s + f.size, 0),
        names: rawFiles.map((f) => f.name),
      });
    }

    try {
      const seenKeys = new Set<string>();
      const prepared: PreparedFile[] = [];
      const clientSkippedNames: string[] = [];

      for (const file of rawFiles) {
        let hash = "";
        try {
          hash = await hashFileSha256(file);
        } catch (err) {
          console.warn("[credentialing upload] client hash failed:", file.name, err);
        }

        const dedupeKey = hash || `${file.name}\0${file.size}\0${file.lastModified}`;
        if (seenKeys.has(dedupeKey)) {
          clientSkippedNames.push(file.name);
          continue;
        }
        seenKeys.add(dedupeKey);

        const mime = file.type.trim().toLowerCase();
        if (
          hash &&
          isDuplicateAgainstExisting({
            hash,
            fileName: file.name,
            fileSize: file.size,
            fileType: mime,
            existing: knownFingerprintsRef.current,
          })
        ) {
          clientSkippedNames.push(file.name);
          continue;
        }

        if (
          !hash &&
          isDuplicateAgainstExisting({
            hash: "",
            fileName: file.name,
            fileSize: file.size,
            fileType: mime,
            existing: knownFingerprintsRef.current,
          })
        ) {
          clientSkippedNames.push(file.name);
          continue;
        }

        prepared.push({ file, hash, size: file.size });
      }

      const batches = batchItemsByTotalSize(prepared, maxCredentialingClientUploadBatchBytes());
      if (PAYER_CREDENTIALING_CLIENT_FILES_PER_REQUEST === 1 && prepared.length > 0) {
        const singleFileBatches = prepared.map((item) => [item]);
        batches.splice(0, batches.length, ...singleFileBatches);
      }

      if (process.env.NODE_ENV !== "production") {
        console.debug("[credentialing upload] batches", {
          batchCount: batches.length,
          batches: batches.map((batch, i) => ({
            batch: i + 1,
            fileCount: batch.length,
            bytes: batch.reduce((s, f) => s + f.size, 0),
            files: batch.map((f) => ({ name: f.file.name, size: f.size })),
          })),
        });
      }

      let aggregate: BulkUploadResult = {
        ok: true,
        uploaded: [],
        skipped: clientSkippedNames.map((fileName) => ({
          fileName,
          code: "duplicate",
          message: "This file is already attached to this carrier.",
        })),
        failed: [],
      };

      let completed = clientSkippedNames.length;
      setProgress({ current: completed, total });

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]!;
        setProgress({ current: completed, total });

        const batchResult = await postUploadBatch({
          credentialingId,
          files: batch,
          category: categoryVal,
          description: descriptionVal,
          batchNumber: batchIndex + 1,
        });
        aggregate = mergeUploadResults(aggregate, batchResult);

        completed += batch.length;
        setProgress({ current: completed, total });

        const uploadedNames = new Set(batchResult.uploaded.map((u) => u.fileName));
        for (const item of batch) {
          if (!uploadedNames.has(item.file.name)) continue;
          knownFingerprintsRef.current.push({
            fileHashSha256: item.hash || null,
            fileName: item.file.name,
            fileSize: item.file.size,
            fileType: item.file.type.trim().toLowerCase(),
          });
        }
      }

      aggregate.message = buildSummaryMessage(aggregate);
      aggregate.ok = aggregate.failed.length === 0 && aggregate.uploaded.length > 0;
      setState(aggregate);

      if (aggregate.uploaded.length > 0) {
        if (input) input.value = "";
        setCategory("");
        setDescription("");
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong during upload. Please try again.";
      console.error("[credentialing upload] failed:", err);
      setClientError(msg);
    } finally {
      setIsPending(false);
      setProgress(null);
    }
  }

  const hasSuccess = Boolean(state?.uploaded.length);
  const hasFailures = Boolean(state?.failed.length);
  const hasSkipped = Boolean(state?.skipped.length);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
      {clientError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {clientError}
        </div>
      ) : null}
      {isPending && progress ? (
        <div role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          Uploading {Math.min(progress.current + 1, progress.total)} of {progress.total} file
          {progress.total === 1 ? "" : "s"}…
        </div>
      ) : null}
      {hasSuccess ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
        >
          {state?.message ?? "Upload complete."}
          {state && state.uploaded.length > 1 ? (
            <ul className="mt-1.5 list-inside list-disc text-xs text-emerald-900/90">
              {state.uploaded.map((u) => (
                <li key={`${u.fileName}-${u.attachmentId ?? ""}`}>{u.fileName}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {hasSkipped && !hasSuccess ? (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {state?.message ?? "Skipped duplicate files."}
        </div>
      ) : null}
      {hasFailures ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state?.message && !hasSuccess && !hasSkipped ? <p className="font-medium">{state.message}</p> : null}
          {hasSuccess && hasFailures ? (
            <p className="mb-1 font-medium text-red-950">Some files could not be uploaded:</p>
          ) : null}
          <ul className="list-inside list-disc space-y-0.5 text-xs">
            {state?.failed.map((f, i) => (
              <li
                key={`${i}-${f.code}-${f.fileName}`}
                className={f.code === "too_large" ? "font-medium text-red-950" : ""}
              >
                <span className="font-medium">{f.fileName}:</span> {f.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
        Files <span className="text-red-600">*</span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          disabled={isPending}
          onChange={() => {
            setClientError(null);
            setState(null);
          }}
          className="text-sm text-slate-800 file:mr-3 file:rounded-lg file:border file:border-sky-200 file:bg-sky-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-sky-900 disabled:opacity-50"
        />
        <span className="font-normal text-slate-500">
          <span className="block">
            Select one or more files (same category/description apply to all). Accepted: PDF, images (JPEG, PNG,
            WebP, GIF), Word, Excel, CSV, TXT, ZIP. Max{" "}
            <strong className="font-semibold text-slate-700">{MAX_MB} MB per file</strong>. Files upload one at a
            time automatically so large selections stay reliable.
          </span>
        </span>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
        Category / type <span className="font-normal text-slate-500">(optional)</span>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inp}
          disabled={isPending}
          placeholder="e.g. Contract, Welcome letter, Screenshot"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
        Description <span className="font-normal text-slate-500">(optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={inp}
          disabled={isPending}
          placeholder="Short note about what this file is"
        />
      </label>
      <button
        type="button"
        disabled={isPending}
        onClick={() => void handleUploadClick()}
        className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Uploading…" : "Upload attachment(s)"}
      </button>
    </div>
  );
}
