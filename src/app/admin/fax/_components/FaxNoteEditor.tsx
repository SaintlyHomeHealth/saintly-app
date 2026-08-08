"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { summarizeFaxNoteAction, updateFaxNoteAction } from "@/app/admin/fax/actions";
import {
  clearFaxAutoSummarizeAttempt,
  enqueueFaxAutoSummarize,
} from "@/app/admin/fax/_components/fax-auto-summarize-queue";
import { crmActionBtnSky, crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FaxNoteEditorProps = {
  faxId: string;
  initialNote: string | null;
  /** When true, blank notes auto-summarize on mount (inbound success faxes). */
  autoSummarize?: boolean;
};

const MAX_LEN = 4000;

export function FaxNoteEditor({ faxId, initialNote, autoSummarize = false }: FaxNoteEditorProps) {
  const router = useRouter();
  const saved = initialNote ?? "";
  const [note, setNote] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [isPending, startTransition] = useTransition();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setNote(initialNote ?? "");
  }, [initialNote]);

  useEffect(() => {
    if (!autoSummarize) return;
    if (saved.trim()) return;

    const queued = enqueueFaxAutoSummarize(faxId, async () => {
      if (!mountedRef.current) return;
      setAutoRunning(true);
      setError(null);
      const result = await summarizeFaxNoteAction(faxId);
      if (!mountedRef.current) return;
      setAutoRunning(false);
      if (!result.ok) {
        clearFaxAutoSummarizeAttempt(faxId);
        setError(result.error ?? "Could not summarize.");
        return;
      }
      setNote(result.note);
      setSavedFlash(true);
      router.refresh();
      window.setTimeout(() => {
        if (mountedRef.current) setSavedFlash(false);
      }, 2500);
    });

    if (queued) setAutoRunning(true);
  }, [autoSummarize, faxId, router, saved]);

  const isDirty = note !== saved;
  const busy = isPending || autoRunning;

  function save() {
    setError(null);
    setSavedFlash(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("faxId", faxId);
      formData.set("note", note.slice(0, MAX_LEN));
      const result = await updateFaxNoteAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Could not save note.");
        return;
      }
      setSavedFlash(true);
      router.refresh();
      window.setTimeout(() => setSavedFlash(false), 2500);
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        name="note"
        value={note}
        maxLength={MAX_LEN}
        onChange={(e) => setNote(e.target.value)}
        rows={6}
        placeholder={
          autoRunning ? "Summarizing fax…" : "Example: PA sent to SCAN Health – Terry Fogg"
        }
        className={`${crmFilterInputCls} min-h-[140px] resize-y`}
        disabled={busy}
      />
      <p className="text-xs text-slate-500">
        Inbound faxes are summarized automatically. You can still edit the note anytime.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy || !isDirty} className={crmActionBtnSky}>
          {isPending ? "Saving…" : "Save note"}
        </button>
        {autoRunning ? <span className="text-xs font-medium text-sky-700">Summarizing…</span> : null}
        {!busy && savedFlash ? <span className="text-xs font-semibold text-emerald-700">Saved</span> : null}
        {!busy && isDirty && !savedFlash ? (
          <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
        ) : null}
        {!busy && !isDirty && !savedFlash && saved ? (
          <span className="text-xs text-slate-500">Up to date</span>
        ) : null}
      </div>
      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
