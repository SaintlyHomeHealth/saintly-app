"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const quickNoteInputCls =
  "mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

export function LeadQuickNoteForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<null | { type: "ok" | "err"; message: string }>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setFeedback(null);
        startTransition(async () => {
          const res = await fetch("/api/crm/lead-activities/quick-note", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ leadId, quick_note: text }),
          });
          const r = (await res.json().catch(() => ({ ok: false as const }))) as {
            ok: boolean;
            error?: string;
          };
          if (res.ok && r.ok) {
            setText("");
            setFeedback({ type: "ok", message: "Note added to thread" });
            router.refresh();
            requestAnimationFrame(() => {
              document.getElementById("lead-thread-end")?.scrollIntoView({ behavior: "smooth", block: "end" });
            });
          } else {
            const msg =
              r.error === "empty"
                ? "Enter a note first."
                : r.error === "forbidden"
                  ? "You don't have permission."
                  : "Could not save note. Try again.";
            setFeedback({ type: "err", message: msg });
          }
        });
      }}
    >
      <label htmlFor={`quick-note-${leadId}`} className="text-[11px] font-medium text-slate-600">
        Quick note
      </label>
      <textarea
        id={`quick-note-${leadId}`}
        name="quick_note"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a quick note — appends to the contact log with a timestamp."
        className={quickNoteInputCls}
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {pending ? "Saving…" : "Save note"}
      </button>
      {feedback ? (
        <p
          role="status"
          className={`text-xs font-medium ${feedback.type === "ok" ? "text-emerald-800" : "text-rose-800"}`}
        >
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}
