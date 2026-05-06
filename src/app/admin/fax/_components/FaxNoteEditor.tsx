"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { updateFaxNoteAction } from "@/app/admin/fax/actions";
import { crmActionBtnSky, crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FaxNoteEditorProps = {
  faxId: string;
  initialNote: string | null;
};

const MAX_LEN = 4000;

export function FaxNoteEditor({ faxId, initialNote }: FaxNoteEditorProps) {
  const router = useRouter();
  const saved = initialNote ?? "";
  const [note, setNote] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setNote(initialNote ?? "");
  }, [initialNote]);

  const isDirty = note !== saved;

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
        placeholder="Example: PA sent to SCAN Health – Terry Fogg"
        className={`${crmFilterInputCls} min-h-[140px] resize-y`}
        disabled={isPending}
      />
      <p className="text-xs text-slate-500">Use this to describe what this fax was for.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={isPending || !isDirty} className={crmActionBtnSky}>
          {isPending ? "Saving…" : "Save note"}
        </button>
        {isPending ? <span className="text-xs font-medium text-slate-500">Saving…</span> : null}
        {!isPending && savedFlash ? <span className="text-xs font-semibold text-emerald-700">Saved</span> : null}
        {!isPending && isDirty && !savedFlash ? <span className="text-xs font-medium text-amber-700">Unsaved changes</span> : null}
        {!isPending && !isDirty && !savedFlash && saved ? <span className="text-xs text-slate-500">Up to date</span> : null}
      </div>
      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
