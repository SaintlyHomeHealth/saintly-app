"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { summarizeFaxNoteAction, updateFaxNoteAction } from "@/app/admin/fax/actions";
import {
  clearFaxAutoSummarizeAttempt,
  enqueueFaxAutoSummarize,
} from "@/app/admin/fax/_components/fax-auto-summarize-queue";
import { crmActionBtnMuted, crmActionBtnSky, crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FaxNoteListCellProps = {
  faxId: string;
  initialNote: string | null;
  /** When true, blank notes auto-summarize on mount (inbound success faxes). */
  autoSummarize?: boolean;
};

const MAX_LEN = 4000;

export function FaxNoteListCell({ faxId, initialNote, autoSummarize = false }: FaxNoteListCellProps) {
  const router = useRouter();
  const baseline = initialNote?.trim() ?? "";
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(baseline);
  const [error, setError] = useState<string | null>(null);
  const [autoStatus, setAutoStatus] = useState<"idle" | "running" | "failed">("idle");
  const [isPending, startTransition] = useTransition();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setNote(initialNote?.trim() ?? "");
  }, [initialNote]);

  useEffect(() => {
    if (!autoSummarize) return;
    if (baseline) return;

    const queued = enqueueFaxAutoSummarize(faxId, async () => {
      if (!mountedRef.current) return;
      setAutoStatus("running");
      setError(null);
      const result = await summarizeFaxNoteAction(faxId);
      if (!mountedRef.current) return;
      if (!result.ok) {
        clearFaxAutoSummarizeAttempt(faxId);
        setAutoStatus("failed");
        setError(result.error ?? "Could not summarize.");
        return;
      }
      setAutoStatus("idle");
      setNote(result.note);
      router.refresh();
    });

    if (queued) setAutoStatus("running");
  }, [autoSummarize, baseline, faxId, router]);

  function cancel() {
    setNote(baseline);
    setEditing(false);
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("faxId", faxId);
      formData.set("note", note.slice(0, MAX_LEN));
      const result = await updateFaxNoteAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Could not save.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex min-w-0 flex-col gap-2 py-0.5" onClick={(e) => e.stopPropagation()}>
        <textarea
          value={note}
          maxLength={MAX_LEN}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className={`${crmFilterInputCls} min-h-[72px] resize-y text-sm`}
          disabled={isPending}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={crmActionBtnSky} onClick={save} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" className={crmActionBtnMuted} onClick={cancel} disabled={isPending}>
            Cancel
          </button>
        </div>
        {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
      </div>
    );
  }

  const display = baseline || note.trim() || "";
  const summarizing = !display && (autoStatus === "running" || isPending);

  return (
    <div className="flex min-w-0 flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1" title={display || undefined}>
          <p
            className={`line-clamp-2 text-sm leading-snug break-words ${
              display ? "text-slate-800" : summarizing ? "italic text-sky-700" : "italic text-slate-400"
            }`}
          >
            {display || (summarizing ? "Summarizing…" : "Add note…")}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          onClick={() => setEditing(true)}
          disabled={isPending || summarizing}
        >
          Edit
        </button>
      </div>
      {error && autoStatus === "failed" ? (
        <p className="text-xs font-medium text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
