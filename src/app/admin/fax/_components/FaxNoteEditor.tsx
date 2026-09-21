"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { updateFaxNoteAction } from "@/app/admin/fax/actions";
import { fx } from "@/app/admin/fax/_components/fax-tokens";

type FaxNoteEditorProps = {
  faxId: string;
  initialNote: string | null;
};

const MAX_LEN = 4000;

export function FaxNoteEditor({ faxId, initialNote }: FaxNoteEditorProps) {
  const router = useRouter();
  const saved = initialNote ?? "";
  const [note, setNote] = useState(saved);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(saved);

  useEffect(() => {
    setNote(initialNote ?? "");
    lastSavedRef.current = initialNote ?? "";
  }, [initialNote]);

  useEffect(() => {
    if (note === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist(note);
    }, 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [note, faxId]);

  async function persist(value: string) {
    setStatus("saving");
    setError(null);
    const formData = new FormData();
    formData.set("faxId", faxId);
    formData.set("note", value.slice(0, MAX_LEN));
    const result = await updateFaxNoteAction(formData);
    if (!result.ok) {
      setStatus("error");
      setError(result.error ?? "Could not save note.");
      return;
    }
    lastSavedRef.current = value;
    setStatus("saved");
    router.refresh();
    window.setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="space-y-2">
      <textarea
        name="note"
        value={note}
        maxLength={MAX_LEN}
        onChange={(e) => {
          setNote(e.target.value);
          setStatus("idle");
        }}
        rows={6}
        placeholder="Staff note — this stays yours. Extraction never overwrites it."
        className={`${fx.input} min-h-[10rem] w-full resize-y`}
      />
      <div className="flex items-center gap-2 text-[12px]">
        {status === "saving" ? <span className="text-[color:var(--fx-text-muted)]">Saving…</span> : null}
        {status === "saved" ? <span className="text-emerald-700">Saved</span> : null}
        {status === "idle" && note === lastSavedRef.current && note ? (
          <span className="text-[color:var(--fx-text-muted)]">Up to date</span>
        ) : null}
        {status === "idle" && note !== lastSavedRef.current ? (
          <span className="text-amber-800">Unsaved</span>
        ) : null}
        {error ? <span className="text-rose-800">{error}</span> : null}
      </div>
    </div>
  );
}
