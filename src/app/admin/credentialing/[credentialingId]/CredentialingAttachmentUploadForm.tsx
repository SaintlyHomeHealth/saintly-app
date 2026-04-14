"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  uploadPayerCredentialingAttachmentAction,
  type BulkUploadResult,
} from "../actions";

const inp =
  "mt-0.5 w-full max-w-lg rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

export function CredentialingAttachmentUploadForm({ credentialingId }: { credentialingId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
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

  const hasSuccess = Boolean(state?.uploaded.length);
  const hasFailures = Boolean(state?.failed.length);

  return (
    <form
      ref={formRef}
      action={formAction}
      encType="multipart/form-data"
      className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4"
    >
      <input type="hidden" name="credentialing_id" value={credentialingId} />
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
            {state?.failed.map((f) => (
              <li key={`${f.code}-${f.fileName}-${f.message}`}>
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
          className="text-sm text-slate-800 file:mr-3 file:rounded-lg file:border file:border-sky-200 file:bg-sky-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-sky-900 disabled:opacity-50"
        />
        <span className="font-normal text-slate-500">Select one or more files (same category/description apply to all).</span>
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
