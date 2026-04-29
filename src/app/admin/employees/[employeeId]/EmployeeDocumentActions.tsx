"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ApplicantFileUploadWithRefresh from "./ApplicantFileUploadWithRefresh";

type DocumentSource = "applicant_file" | "legacy_document";

export type EmployeeDocumentHistoryEntry = {
  displayLine: string;
  viewUrl: string | null;
};

type Props = {
  employeeId: string;
  itemType: "document" | "form";
  uploadLabel: string;
  documentType: string;
  workflowOpenHref?: string | null;
  portalHref?: string | null;
  viewUrl?: string | null;
  downloadUrl?: string | null;
  completeComplianceEventId?: string;
  history?: EmployeeDocumentHistoryEntry[];
  fileRecordId?: string | null;
  fileRecordSource?: DocumentSource | null;
  compact?: boolean;
};

const REMOVE_CONFIRMATION =
  "Remove this document from the employee file? This will mark the requirement incomplete until a correct file is uploaded.";

export default function EmployeeDocumentActions({
  employeeId,
  itemType,
  uploadLabel,
  documentType,
  workflowOpenHref,
  portalHref,
  viewUrl,
  downloadUrl,
  completeComplianceEventId,
  history = [],
  fileRecordId,
  fileRecordSource,
  compact = false,
}: Props) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const canManageUpload = itemType === "document";
  const hasCurrentFile = Boolean(viewUrl);
  const canRemove = canManageUpload && Boolean(fileRecordId && fileRecordSource);

  const actionClass = compact
    ? "text-xs font-semibold text-sky-700 underline"
    : "text-xs font-semibold text-sky-700 underline";

  const handleRemove = async () => {
    if (!canRemove || isRemoving) return;
    if (!window.confirm(REMOVE_CONFIRMATION)) return;

    try {
      setIsRemoving(true);
      const params = new URLSearchParams({
        recordId: fileRecordId!,
        source: fileRecordSource!,
      });
      const response = await fetch(`/api/admin/employee-documents?${params.toString()}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error || "Failed to remove document");
      }

      setUploadOpen(false);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to remove document");
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
        {workflowOpenHref ? (
          <a href={workflowOpenHref} className={actionClass}>
            Open
          </a>
        ) : null}
        {portalHref ? (
          <a href={portalHref} className={actionClass}>
            Portal
          </a>
        ) : null}
        {viewUrl ? (
          <a href={viewUrl} target="_blank" rel="noreferrer" className={actionClass}>
            View
          </a>
        ) : null}
        {downloadUrl ? (
          <a href={downloadUrl} className={actionClass}>
            Download
          </a>
        ) : null}
        {canManageUpload ? (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className={actionClass}
          >
            {hasCurrentFile ? "Replace" : "Add"}
          </button>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isRemoving}
            className="text-xs font-semibold text-red-700 underline disabled:no-underline disabled:opacity-60"
          >
            {isRemoving ? "Removing..." : "Delete"}
          </button>
        ) : null}
      </div>

      {uploadOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/35 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-document-control-modal-title"
          onClick={() => setUploadOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-slate-200 bg-white sm:rounded-lg sm:shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
              <div>
                <h4
                  id="employee-document-control-modal-title"
                  className="text-base font-semibold text-slate-900"
                >
                  {uploadLabel}
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  {hasCurrentFile
                    ? "Replace the file on record or remove it if the wrong document was uploaded."
                    : "Add the required file to complete this item."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-4 py-3">
              <ApplicantFileUploadWithRefresh
                applicantId={employeeId}
                documentType={documentType}
                label={uploadLabel}
                completeComplianceEventId={completeComplianceEventId}
              />

              {canRemove ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3">
                  <p className="text-xs text-red-700">
                    Removing this file will immediately mark this requirement as missing until a
                    correct replacement is uploaded.
                  </p>
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={isRemoving}
                    className="mt-2 text-xs font-semibold text-red-700 underline disabled:no-underline disabled:opacity-60"
                  >
                    {isRemoving ? "Removing..." : "Delete current file"}
                  </button>
                </div>
              ) : null}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Version history
                </p>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto border border-slate-100">
                  {history.length === 0 ? (
                    <li className="px-2 py-2 text-xs text-slate-500">No prior uploads.</li>
                  ) : (
                    history.map((entry, index) => (
                      <li
                        key={`${entry.displayLine}-${index}`}
                        className="flex items-center justify-between gap-2 border-b border-slate-50 px-2 py-1.5 text-xs last:border-0"
                      >
                        <span className="text-slate-700">{entry.displayLine}</span>
                        {entry.viewUrl ? (
                          <a
                            href={entry.viewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 font-semibold text-sky-700 underline"
                          >
                            View
                          </a>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
