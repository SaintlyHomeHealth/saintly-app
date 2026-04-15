"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recruitingQuickAction } from "@/app/admin/recruiting/actions";

/** Same invocation path as Quick action “Add note” (server action + router.refresh). */
export function RecruitingNoteComposer({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitNote(raw: string) {
    const note = raw.trim();
    if (!note) return;
    setError(null);
    startTransition(async () => {
      const res = await recruitingQuickAction({
        candidateId,
        kind: "note",
        body: note,
      });
      if (!res.ok) {
        setError(res.message);
        console.error("[recruiting] timeline note save failed:", res.message);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        submitNote(body);
      }}
    >
      <textarea
        id={`recruiting-note-${candidateId}`}
        name="note"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
        rows={3}
        className="min-h-[88px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[15px] leading-relaxed text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200/80 disabled:opacity-60"
        placeholder="Log a call note, text outcome, or context…"
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitNote((e.currentTarget as HTMLTextAreaElement).value);
          }
        }}
      />
      {error ? (
        <p className="text-[12px] font-medium text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">Enter to save · Shift+Enter for a new line</p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-sky-600 bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add note"}
        </button>
      </div>
    </form>
  );
}
