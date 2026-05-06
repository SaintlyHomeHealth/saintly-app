"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FileText, Trash2 } from "lucide-react";

import type { LeadAttachmentWorkspaceRow } from "@/lib/crm/lead-attachments-load";
import {
  LEAD_ATTACHMENT_CATEGORY_OPTIONS,
  LEAD_ATTACHMENT_MAX_BYTES,
} from "@/lib/crm/lead-attachments-constants";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

const inp =
  "mt-0.5 w-full max-w-md rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const maxMb = Math.round(LEAD_ATTACHMENT_MAX_BYTES / (1024 * 1024));

export function LeadAttachmentsPanel(props: {
  leadId: string;
  initialRows: LeadAttachmentWorkspaceRow[];
}) {
  const { leadId, initialRows } = props;
  const router = useRouter();

  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(LEAD_ATTACHMENT_CATEGORY_OPTIONS[0] ?? "Other");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file || file.size <= 0) {
      setError("Choose a file to upload.");
      return;
    }
    if (file.size > LEAD_ATTACHMENT_MAX_BYTES) {
      setError(`File is too large (max ${maxMb} MB).`);
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("category", category);
      if (note.trim()) fd.set("note", note.trim());

      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/attachments`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setError(
          data.error === "invalid_type"
            ? "This file type is not allowed. Use PDF, common images, Word, or plain text."
            : data.error === "file_too_large"
              ? `File is too large (max ${maxMb} MB).`
              : "Upload failed. Try again."
        );
        return;
      }

      setFile(null);
      setNote("");
      refresh();
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this attachment? This cannot be undone.")) return;
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(leadId)}/attachments/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        const err = typeof data.error === "string" ? data.error : "";
        if (err === "storage_delete_failed") {
          setError("Could not remove the file from storage. The attachment record was kept — try again in a moment.");
        } else if (err === "metadata_delete_failed") {
          setError(
            "The file was removed from storage but the database update failed. Please contact an administrator to reconcile this attachment."
          );
        } else {
          setError("Could not delete. Try again.");
        }
        return;
      }
      refresh();
    } catch {
      setError("Could not delete. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const viewHref = (id: string) =>
    `/api/crm/leads/${encodeURIComponent(leadId)}/attachments/${encodeURIComponent(id)}/file`;
  const downloadHref = (id: string) => `${viewHref(id)}?download=1`;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
          {error}
        </div>
      ) : null}

      <form onSubmit={onUpload} className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Upload</p>
        <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            File <span className="text-red-600">*</span>
            <input
              type="file"
              className={inp}
              disabled={uploading}
              onChange={(ev) => {
                const f = ev.target.files?.[0] ?? null;
                setFile(f);
              }}
            />
            <span className="text-[10px] font-normal text-slate-400">
              PDF, images, Word, or text — up to {maxMb} MB.
            </span>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Category
            <select
              className={inp}
              value={category}
              disabled={uploading}
              onChange={(e) => setCategory(e.target.value)}
            >
              {LEAD_ATTACHMENT_CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Note (optional)
            <textarea
              className={inp}
              rows={2}
              value={note}
              disabled={uploading}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Context for staff reviewing this file…"
            />
          </label>
        </div>
        <div className="mt-4">
          <button
            type="submit"
            disabled={uploading || !file}
            className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {rows.length} file{rows.length === 1 ? "" : "s"}
        </p>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No attachments yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                    <FileText className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-900">{r.file_name}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-medium text-slate-700">{r.category}</span>
                      {r.note ? (
                        <span className="mt-1 block text-slate-500 whitespace-pre-wrap">{r.note}</span>
                      ) : null}
                    </p>
                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <div>
                        <dt className="inline font-medium text-slate-600">Uploaded </dt>
                        <dd className="inline">
                          {formatAppDateTime(r.created_at, "", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </dd>
                      </div>
                      {r.uploaded_by_label ? (
                        <div>
                          <dt className="inline font-medium text-slate-600">By </dt>
                          <dd className="inline">{r.uploaded_by_label}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="inline font-medium text-slate-600">Size </dt>
                        <dd className="inline">{formatBytes(r.size_bytes)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  <a
                    href={viewHref(r.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    View
                  </a>
                  <a
                    href={downloadHref(r.id)}
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    disabled={deletingId === r.id}
                    onClick={() => onDelete(r.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {deletingId === r.id ? "…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
