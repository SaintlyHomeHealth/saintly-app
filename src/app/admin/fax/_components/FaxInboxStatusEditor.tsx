"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { setFaxInboxStatusAction, updateFaxStatusNoteAction } from "@/app/admin/fax/actions";
import { crmActionBtnSky, crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";
import {
  FAX_FILING_TABS,
  FAX_STATUS_NOTE_MAX_LEN,
  type FaxInboxStatus,
} from "@/lib/fax/fax-ehr-filing";

type FaxInboxStatusEditorProps = {
  faxId: string;
  initialStatus: FaxInboxStatus;
  initialNote: string | null;
};

const STATUS_OPTIONS = FAX_FILING_TABS.filter((tab) => tab.id !== "no_document");

export function FaxInboxStatusEditor({ faxId, initialStatus, initialNote }: FaxInboxStatusEditorProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [seenStatus, setSeenStatus] = useState(initialStatus);
  const serverNote = initialNote ?? "";
  const [note, setNote] = useState(serverNote);
  const [savedNote, setSavedNote] = useState(serverNote);
  const [seenNote, setSeenNote] = useState(serverNote);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSavedFlash, setNoteSavedFlash] = useState(false);
  const [statusPending, startStatusTransition] = useTransition();
  const [notePending, startNoteTransition] = useTransition();
  const noteSaveLock = useRef(false);

  if (initialStatus !== seenStatus) {
    setSeenStatus(initialStatus);
    setStatus(initialStatus);
  }
  if (serverNote !== seenNote && note.trim() === savedNote.trim()) {
    setSeenNote(serverNote);
    setNote(serverNote);
    setSavedNote(serverNote);
  }

  function onStatusChange(next: string) {
    if (next === status) return;
    const previous = status;
    setStatus(next as FaxInboxStatus);
    setStatusError(null);
    startStatusTransition(async () => {
      const result = await setFaxInboxStatusAction(faxId, next);
      if (!result.ok) {
        setStatus(previous);
        setStatusError(result.error ?? "Could not update the filing status.");
        return;
      }
      setStatus(result.inboxStatus);
      router.refresh();
    });
  }

  function saveNote() {
    const next = note.trim();
    if (noteSaveLock.current || next === savedNote.trim()) return;
    noteSaveLock.current = true;
    setNoteError(null);
    setNoteSavedFlash(false);
    startNoteTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("faxId", faxId);
        formData.set("statusNote", note);
        const result = await updateFaxStatusNoteAction(formData);
        if (!result.ok) {
          setNoteError(result.error ?? "Could not save the status note.");
          return;
        }
        const saved = result.statusNote ?? "";
        setNote(saved);
        setSavedNote(saved);
        setNoteSavedFlash(true);
        router.refresh();
        window.setTimeout(() => setNoteSavedFlash(false), 2500);
      } finally {
        noteSaveLock.current = false;
      }
    });
  }

  const noteDirty = note.trim() !== savedNote.trim();

  return (
    <div className="flex w-[20rem] max-w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
        Filing status
        <select
          value={status}
          disabled={statusPending}
          onChange={(event) => onStatusChange(event.target.value)}
          className={`${crmFilterInputCls} text-sm font-semibold text-slate-800`}
          aria-label="Filing status"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {statusPending ? <span className="text-[11px] font-medium text-sky-700">Saving status…</span> : null}
      {statusError ? <span className="text-[11px] font-medium text-rose-700">{statusError}</span> : null}

      <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
        Status note
        <textarea
          value={note}
          maxLength={FAX_STATUS_NOTE_MAX_LEN}
          rows={2}
          disabled={notePending}
          placeholder="Why this fax is not filed yet"
          onChange={(event) => {
            setNote(event.target.value);
            setNoteSavedFlash(false);
          }}
          onBlur={() => {
            if (note.trim() !== savedNote.trim()) saveNote();
          }}
          className={`${crmFilterInputCls} min-h-[4.5rem] resize-y text-sm font-normal`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={saveNote} disabled={notePending || !noteDirty} className={crmActionBtnSky}>
          {notePending ? "Saving…" : "Save note"}
        </button>
        <span className="text-[11px] text-slate-500">
          {note.length}/{FAX_STATUS_NOTE_MAX_LEN}
        </span>
        {!notePending && noteSavedFlash ? <span className="text-[11px] font-semibold text-emerald-700">Saved</span> : null}
        {!notePending && noteDirty && !noteSavedFlash ? (
          <span className="text-[11px] font-medium text-amber-700">Unsaved changes</span>
        ) : null}
      </div>
      {noteError ? <span className="text-[11px] font-medium text-rose-700">{noteError}</span> : null}
    </div>
  );
}
