"use client";

import { useState } from "react";

import { getPatientReferralFileSignedUrlById } from "@/app/admin/crm/patient-referral-actions";
import type { PatientFileListRow } from "@/lib/crm/patient-referral/types";

const VIEW_ERROR =
  "Could not open file. Storage path missing or signed URL failed.";

function openInNewTab(url: string): boolean {
  const win = window.open(url, "_blank", "noopener,noreferrer");
  return win != null;
}

export function PatientReferralFilesList({ files }: { files: PatientFileListRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  if (!files.length) return null;

  async function handleViewFile(file: PatientFileListRow) {
    setError(null);
    setFallbackUrl(null);

    if (!file.file_path?.trim()) {
      setError("File was not saved to storage.");
      return;
    }

    setPendingId(file.id);
    try {
      const res = await getPatientReferralFileSignedUrlById(file.id);
      if (!res.ok) {
        setError(res.error || VIEW_ERROR);
        return;
      }

      const opened = openInNewTab(res.url);
      if (!opened) {
        setError("Popup blocked. Click the link below to open the file.");
        setFallbackUrl(res.url);
      }
    } catch {
      setError(VIEW_ERROR);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-800">Uploaded documents</h3>
      {error ? (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {error}
          {fallbackUrl ? (
            <>
              {" "}
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sky-800 underline"
              >
                Open file
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <ul className="mt-2 space-y-2">
        {files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-800">{f.file_name}</span>
            {!f.file_path?.trim() ? (
              <span className="text-xs text-amber-800">File was not saved to storage</span>
            ) : (
              <button
                type="button"
                className="text-xs font-semibold text-sky-800 hover:underline disabled:opacity-50"
                disabled={pendingId === f.id}
                onClick={() => void handleViewFile(f)}
              >
                {pendingId === f.id ? "Opening…" : "View file"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
