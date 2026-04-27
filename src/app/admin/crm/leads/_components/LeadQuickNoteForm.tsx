"use client";

import { Loader2, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { refreshPreservingWindowScroll } from "@/lib/navigation/scroll-preserving-refresh";

const inputCls =
  "min-h-[42px] w-full flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400";

export function LeadQuickNoteForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<null | { type: "ok" | "err"; message: string }>(null);

  function submit() {
    setFeedback(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setFeedback({ type: "err", message: "Enter a note first." });
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/crm/lead-activities/quick-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ leadId, quick_note: trimmed }),
      });
      const r = (await res.json().catch(() => ({ ok: false as const }))) as {
        ok: boolean;
        error?: string;
      };
      if (res.ok && r.ok) {
        setText("");
        setFeedback({ type: "ok", message: "Sent" });
        refreshPreservingWindowScroll(router);
        window.setTimeout(() => setFeedback(null), 1500);
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
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          id={`quick-note-${leadId}`}
          name="quick_note"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note…"
          className={inputCls}
          aria-label="Note"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          disabled={pending}
          className="flex h-[42px] shrink-0 items-center justify-center rounded-2xl bg-sky-500 px-3.5 text-white shadow-sm hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Send note"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <SendHorizontal className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {feedback ? (
        <p
          role="status"
          className={`text-center text-[11px] font-medium ${feedback.type === "ok" ? "text-emerald-700" : "text-rose-700"}`}
        >
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}
