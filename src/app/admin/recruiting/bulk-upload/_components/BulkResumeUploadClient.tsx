"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  crmActionBtnSky,
  crmListScrollOuterCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";

import { processBulkResumeFile, type BulkResumeProcessResult } from "../../actions";

const ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type QueuedFile = {
  id: string;
  file: File;
};

type RowState =
  | { phase: "queued" }
  | { phase: "processing" }
  | { phase: "done"; result: BulkResumeProcessResult };

function statusLabel(s: BulkResumeProcessResult["status"]): string {
  switch (s) {
    case "created":
      return "Created";
    case "duplicate":
      return "Duplicate";
    case "needs_review":
      return "Needs review";
    case "failed":
      return "Failed";
    default:
      return s;
  }
}

function statusPillClass(s: BulkResumeProcessResult["status"]): string {
  switch (s) {
    case "created":
      return "border border-emerald-300/90 bg-emerald-50 text-emerald-950 shadow-sm ring-2 ring-emerald-200/90";
    case "duplicate":
      return "border border-amber-300/90 bg-amber-50 text-amber-950 shadow-sm ring-2 ring-amber-200/90";
    case "needs_review":
      return "border border-sky-300/90 bg-sky-50 text-sky-950 shadow-sm ring-2 ring-sky-200/90";
    case "failed":
      return "border border-rose-300/90 bg-rose-50 text-rose-950 shadow-sm ring-2 ring-rose-200/90";
    default:
      return "border border-slate-200 bg-slate-100 text-slate-800 ring-1 ring-slate-200";
  }
}

type ResultCounts = {
  created: number;
  duplicate: number;
  needs_review: number;
  failed: number;
};

function computeResultCounts(queue: QueuedFile[], rows: Record<string, RowState>): ResultCounts {
  const out: ResultCounts = { created: 0, duplicate: 0, needs_review: 0, failed: 0 };
  for (const q of queue) {
    const st = rows[q.id];
    if (st?.phase !== "done") continue;
    switch (st.result.status) {
      case "created":
        out.created++;
        break;
      case "duplicate":
        out.duplicate++;
        break;
      case "needs_review":
        out.needs_review++;
        break;
      case "failed":
        out.failed++;
        break;
      default:
        break;
    }
  }
  return out;
}

export function BulkResumeUploadClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list);
    const next: QueuedFile[] = [];
    for (const f of arr) {
      const lower = f.name.toLowerCase();
      if (!lower.endsWith(".pdf") && !lower.endsWith(".doc") && !lower.endsWith(".docx")) continue;
      next.push({ id: crypto.randomUUID(), file: f });
    }
    if (next.length === 0) return;
    setQueue((q) => [...q, ...next]);
    setRows((prev) => {
      const n = { ...prev };
      for (const q of next) {
        n[q.id] = { phase: "queued" };
      }
      return n;
    });
  }, []);

  const removeFromQueue = (id: string) => {
    setQueue((q) => q.filter((x) => x.id !== id));
    setRows((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  };

  const clearAll = () => {
    setQueue([]);
    setRows({});
  };

  const runBatch = async () => {
    if (queue.length === 0 || isRunning) return;
    setIsRunning(true);
    for (const item of queue) {
      setRows((prev) => ({ ...prev, [item.id]: { phase: "processing" } }));
      try {
        const fd = new FormData();
        fd.set("file", item.file);
        const result = await processBulkResumeFile(fd);
        setRows((prev) => ({ ...prev, [item.id]: { phase: "done", result } }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setRows((prev) => ({
          ...prev,
          [item.id]: {
            phase: "done",
            result: {
              fileName: item.file.name,
              status: "failed",
              extractedName: null,
              discipline: null,
              phone: null,
              email: null,
              candidateId: null,
              existingCandidateId: null,
              duplicateReasonLabel: null,
              errorMessage: msg || "Unexpected error.",
            },
          },
        }));
      }
    }
    setIsRunning(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const hasAnyDone = queue.some((q) => rows[q.id]?.phase === "done");
  const resultCounts = useMemo(() => computeResultCounts(queue, rows), [queue, rows]);

  return (
    <div className="space-y-8">
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={onDrop}
        className={`rounded-[28px] border-2 border-dashed px-6 py-12 text-center transition ${
          dragOver
            ? "border-sky-400 bg-sky-50/80 shadow-inner"
            : "border-slate-200 bg-gradient-to-b from-white to-slate-50/90 shadow-sm"
        }`}
      >
        <p className="text-sm font-semibold text-slate-900">Drop resumes here</p>
        <p className="mt-1 text-xs text-slate-600">PDF, DOC, or DOCX — multiple files at once</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={crmPrimaryCtaCls}
          >
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {queue.length > 0 && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Queue <span className="font-normal text-slate-500">({queue.length} files)</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearAll}
                disabled={isRunning}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Clear queue
              </button>
              <button
                type="button"
                onClick={runBatch}
                disabled={isRunning}
                className={crmPrimaryCtaCls}
              >
                {isRunning ? "Processing…" : "Process all"}
              </button>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {queue.map((q) => {
              const st = rows[q.id];
              const phase = st?.phase ?? "queued";
              return (
                <li
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{q.file.name}</span>
                  <span className="shrink-0 text-slate-500">
                    {phase === "queued" && "Waiting"}
                    {phase === "processing" && (
                      <span className="inline-flex items-center gap-1 text-sky-700">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                        Processing
                      </span>
                    )}
                    {phase === "done" && (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusPillClass(st.result.status)}`}
                      >
                        {statusLabel(st.result.status)}
                      </span>
                    )}
                  </span>
                  {phase === "queued" && (
                    <button
                      type="button"
                      onClick={() => removeFromQueue(q.id)}
                      disabled={isRunning}
                      className="shrink-0 text-[11px] font-semibold text-slate-500 hover:text-rose-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasAnyDone && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Results</h2>
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-slate-200/90 bg-slate-50/95 px-3 py-2 text-[11px] font-medium text-slate-700 shadow-sm"
              aria-label="Batch result summary"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                <span className="text-slate-600">Created</span>
                <span className="tabular-nums font-semibold text-emerald-900">{resultCounts.created}</span>
              </span>
              <span className="text-slate-300" aria-hidden>
                |
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                <span className="text-slate-600">Duplicate</span>
                <span className="tabular-nums font-semibold text-amber-950">{resultCounts.duplicate}</span>
              </span>
              <span className="text-slate-300" aria-hidden>
                |
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" aria-hidden />
                <span className="text-slate-600">Needs review</span>
                <span className="tabular-nums font-semibold text-sky-950">{resultCounts.needs_review}</span>
              </span>
              <span className="text-slate-300" aria-hidden>
                |
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
                <span className="text-slate-600">Failed</span>
                <span className="tabular-nums font-semibold text-rose-950">{resultCounts.failed}</span>
              </span>
            </div>
          </div>
          <div className={crmListScrollOuterCls}>
            <table className="min-w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <th className="whitespace-nowrap px-4 py-3">File</th>
                  <th className="whitespace-nowrap px-4 py-3">Name</th>
                  <th className="whitespace-nowrap px-4 py-3">Discipline</th>
                  <th className="whitespace-nowrap px-4 py-3">Phone</th>
                  <th className="whitespace-nowrap px-4 py-3">Email</th>
                  <th className="min-w-[10rem] px-4 py-3">Status</th>
                  <th className="whitespace-nowrap px-4 py-3">Link</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => {
                  const st = rows[q.id];
                  if (st?.phase !== "done") return null;
                  const r = st.result;
                  const link =
                    r.status === "created" && r.candidateId
                      ? `/admin/recruiting/${r.candidateId}`
                      : r.status === "duplicate" && r.existingCandidateId
                        ? `/admin/recruiting/${r.existingCandidateId}`
                        : null;
                  return (
                    <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="max-w-[12rem] truncate px-4 py-2.5 font-medium text-slate-900" title={r.fileName}>
                        {r.fileName}
                      </td>
                      <td className="max-w-[10rem] truncate px-4 py-2.5 text-slate-700">{r.extractedName ?? "—"}</td>
                      <td className="max-w-[8rem] truncate px-4 py-2.5 text-slate-600">{r.discipline ?? "—"}</td>
                      <td className="max-w-[8rem] truncate px-4 py-2.5 text-slate-600">{r.phone ?? "—"}</td>
                      <td className="max-w-[12rem] truncate px-4 py-2.5 text-slate-600">{r.email ?? "—"}</td>
                      <td className="max-w-[14rem] px-4 py-2.5 align-top">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusPillClass(r.status)}`}
                        >
                          {statusLabel(r.status)}
                        </span>
                        {r.status === "duplicate" && r.duplicateReasonLabel ? (
                          <div className="mt-2 rounded-lg border border-amber-200/90 bg-amber-50/95 px-2.5 py-2 text-[11px] leading-snug text-amber-950">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-amber-800/90">
                              Match
                            </span>
                            <span className="mt-0.5 block">{r.duplicateReasonLabel}</span>
                          </div>
                        ) : null}
                        {r.status !== "duplicate" && r.errorMessage ? (
                          <span className="mt-2 block text-[11px] leading-snug text-rose-800">{r.errorMessage}</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {link ? (
                          <Link href={link} className={crmActionBtnSky}>
                            Open
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-500">
            Auto-create requires a detected full name and at least phone or email. Duplicates match normalized email,
            phone, or name+city. Use{" "}
            <Link href="/admin/recruiting/new-from-resume" className="font-semibold text-sky-800 hover:underline">
              New from resume
            </Link>{" "}
            to review fields manually.
          </p>
        </div>
      )}
    </div>
  );
}
