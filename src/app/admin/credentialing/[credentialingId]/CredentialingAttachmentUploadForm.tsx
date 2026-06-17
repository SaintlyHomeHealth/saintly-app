"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  batchItemsByTotalSize,
  isDuplicateAgainstExisting,
  maxCredentialingUploadBatchBytes,
  type ExistingAttachmentFingerprint,
} from "@/lib/crm/payer-credentialing-attachments";
import { hashFileSha256 } from "@/lib/crm/payer-credentialing-attachments-client";
import { PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES } from "@/lib/crm/payer-credentialing-storage";

import {
  uploadPayerCredentialingAttachmentAction,
  type BulkUploadResult,
} from "../actions";

const inp =
  "mt-0.5 w-full max-w-lg rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

const MAX_MB = Math.round(PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES / (1024 * 1024));

type PreparedFile = {
  file: File;
  hash: string;
  size: number;
};

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

export function CredentialingAttachmentUploadForm({
  credentialingId,
  existingAttachments,
}: {
  credentialingId: string;
  existingAttachments: ExistingAttachmentFingerprint[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const knownFingerprintsRef = useRef<ExistingAttachmentFingerprint[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [state, setState] = useState<BulkUploadResult | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    setState(null);

    const fd = new FormData(e.currentTarget);
    const rawFiles = fd.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
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

    const category = fd.get("attachment_category");
    const description = fd.get("attachment_description");
    const categoryVal = typeof category === "string" && category.trim() ? category.trim() : null;
    const descriptionVal = typeof description === "string" && description.trim() ? description.trim() : null;

    setIsPending(true);
    knownFingerprintsRef.current = existingAttachments.map((row) => ({ ...row }));
    const total = rawFiles.length;
    setProgress({ current: 0, total });

    try {
      const seenHashes = new Set<string>();
      const prepared: PreparedFile[] = [];
      const clientSkippedNames: string[] = [];

      for (const file of rawFiles) {
        const hash = await hashFileSha256(file);
        if (seenHashes.has(hash)) {
          clientSkippedNames.push(file.name);
          continue;
        }
        seenHashes.add(hash);

        const mime = file.type.trim().toLowerCase();
        if (
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

        prepared.push({ file, hash, size: file.size });
      }

      const batches = batchItemsByTotalSize(prepared, maxCredentialingUploadBatchBytes());

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

      for (const batch of batches) {
        setProgress({ current: completed, total });

        const batchFd = new FormData();
        batchFd.set("credentialing_id", credentialingId);
        if (categoryVal) batchFd.set("attachment_category", categoryVal);
        if (descriptionVal) batchFd.set("attachment_description", descriptionVal);
        for (const item of batch) {
          batchFd.append("files", item.file);
        }

        const batchResult = await uploadPayerCredentialingAttachmentAction(null, batchFd);
        aggregate = mergeUploadResults(aggregate, batchResult);

        completed += batch.length;
        setProgress({ current: completed, total });

        const uploadedNames = new Set(batchResult.uploaded.map((u) => u.fileName));
        for (const item of batch) {
          if (!uploadedNames.has(item.file.name)) continue;
          knownFingerprintsRef.current.push({
            fileHashSha256: item.hash,
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
        formRef.current?.reset();
        router.refresh();
      }
    } catch {
      setClientError("Something went wrong during upload. Please try again.");
    } finally {
      setIsPending(false);
      setProgress(null);
    }
  }

  const hasSuccess = Boolean(state?.uploaded.length);
  const hasFailures = Boolean(state?.failed.length);
  const hasSkipped = Boolean(state?.skipped.length);

  return (
    <form
      ref={formRef}
      encType="multipart/form-data"
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4"
    >
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
          name="files"
          type="file"
          multiple
          required
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
            <strong className="font-semibold text-slate-700">{MAX_MB} MB per file</strong>. Large selections are
            uploaded automatically in batches under the{" "}
            <strong className="font-semibold text-slate-700">25 MB</strong> request limit.
          </span>
        </span>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
        Category / type <span className="font-normal text-slate-500">(optional)</span>
        <input
          name="attachment_category"
          className={inp}
          disabled={isPending}
          placeholder="e.g. Contract, Welcome letter, Screenshot"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-700">
        Description <span className="font-normal text-slate-500">(optional)</span>
        <textarea
          name="attachment_description"
          rows={2}
          className={inp}
          disabled={isPending}
          placeholder="Short note about what this file is"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Uploading…" : "Upload attachment(s)"}
      </button>
    </form>
  );
}
