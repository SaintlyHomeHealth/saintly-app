"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES } from "@/lib/crm/payer-credentialing-storage";

import {
  uploadPayerCredentialingAttachmentAction,
  type BulkUploadResult,
} from "../actions";

const inp =
  "mt-0.5 w-full max-w-lg rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

const MAX_MB = Math.round(PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES / (1024 * 1024));

export function CredentialingAttachmentUploadForm({ credentialingId }: { credentialingId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    uploadPayerCredentialingAttachmentAction,
    null as BulkUploadResult | null
  );

  useEffect(() => {
    if (state?.uploaded && state.uploaded.length > 0) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    setClientError(null);
    const fd = new FormData(e.currentTarget);
    const files = fd.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
    for (const f of files) {
      if (f.size > PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES) {
        e.preventDefault();
        setClientError(
          `"${f.name}" is over ${MAX_MB} MB. Split the file or choose a smaller file (max ${MAX_MB} MB per file).`
        );
        return;
      }
    }
  }

  const hasSuccess = Boolean(state?.uploaded.length);
  const hasFailures = Boolean(state?.failed.length);

  return (
    <form
      ref={formRef}
      action={formAction}
      encType="multipart/form-data"
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4"
    >
      <input type="hidden" name="credentialing_id" value={credentialingId} />
      {clientError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {clientError}
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
      {hasFailures ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state?.message && !hasSuccess ? <p className="font-medium">{state.message}</p> : null}
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
          onChange={() => setClientError(null)}
          className="text-sm text-slate-800 file:mr-3 file:rounded-lg file:border file:border-sky-200 file:bg-sky-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-sky-900 disabled:opacity-50"
        />
        <span className="font-normal text-slate-500">
          <span className="block">
            Select one or more files (same category/description apply to all). Accepted: PDF, images (JPEG, PNG,
            WebP, GIF), Word, Excel, CSV, TXT, ZIP. Max{" "}
            <strong className="font-semibold text-slate-700">{MAX_MB} MB per file</strong>. Request body limit{" "}
            <strong className="font-semibold text-slate-700">25 MB</strong> total (keep batches within that).
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
