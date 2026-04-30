"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useRef, useState } from "react";

import {
  APPLICANT_FILE_UPLOAD_ACCEPTED_MIME_TYPES,
  getApplicantUploadAcceptedFormatsHint,
  getEffectiveApplicantUploadMime,
  isAllowedApplicantUploadDocumentType,
  normalizeApplicantUploadDocumentType,
} from "@/lib/applicant-file-upload-types";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const canManageUpload = itemType === "document";
  const hasCurrentFile = Boolean(viewUrl);
  const canRemove = canManageUpload && Boolean(fileRecordId && fileRecordSource);

  const actionClass = compact
    ? "text-xs font-semibold text-sky-700 underline"
    : "text-xs font-semibold text-sky-700 underline";

  const resetUploadState = () => {
    setSelectedFile(null);
    setSelectedFileName("");
    setUploadError("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const closeUploadModal = () => {
    setUploadOpen(false);
    resetUploadState();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setSelectedFileName(file?.name ?? "");
    setUploadError("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Please choose a file before uploading.");
      return;
    }

    const normalizedDocType = normalizeApplicantUploadDocumentType(documentType);
    if (!isAllowedApplicantUploadDocumentType(documentType)) {
      console.error("[EmployeeDocumentActions] Unsupported document type", {
        documentType,
        normalizedDocumentType: normalizedDocType,
        employeeId,
      });
      setUploadError(
        `This upload is misconfigured (unsupported document type: ${normalizedDocType || "(empty)"}).`
      );
      return;
    }

    const effectiveMime = getEffectiveApplicantUploadMime(selectedFile);
    if (
      !effectiveMime ||
      !(APPLICANT_FILE_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]).includes(effectiveMime)
    ) {
      setUploadError(
        `This file type is not accepted (${selectedFile.type || "unknown"}). ${getApplicantUploadAcceptedFormatsHint()}`
      );
      return;
    }

    try {
      setIsUploading(true);
      setUploadError("");

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("employeeId", employeeId);
      formData.append("documentKey", documentType);
      formData.append("applicantId", employeeId);
      formData.append("documentType", documentType);
      formData.append("displayName", uploadLabel);
      formData.append("required", "true");
      if (completeComplianceEventId) {
        formData.append("completeComplianceEventId", completeComplianceEventId);
      }

      const response = await fetch("/api/upload-applicant-file", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error || "Upload failed");
      }

      closeUploadModal();
      router.refresh();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

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

      closeUploadModal();
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
          <a
            href={workflowOpenHref}
            className={actionClass}
            onClick={() => {
              console.log("[EmployeeDocumentActions] Open clicked", {
                employeeId,
                uploadLabel,
                documentType,
                workflowOpenHref,
              });
            }}
          >
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
          onClick={closeUploadModal}
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
                onClick={closeUploadModal}
                className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-4 py-3">
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center justify-center rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Choose File
                  </button>
                  <span className="min-w-0 text-sm text-slate-600">
                    {selectedFileName || "No file selected"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{getApplicantUploadAcceptedFormatsHint()}</p>
                {uploadError ? <p className="text-xs text-red-700">{uploadError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="rounded bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUploading ? "Uploading..." : hasCurrentFile ? "Replace file" : "Upload file"}
                  </button>
                  <button
                    type="button"
                    onClick={resetUploadState}
                    disabled={isUploading || (!selectedFile && !selectedFileName)}
                    className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              </div>

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
