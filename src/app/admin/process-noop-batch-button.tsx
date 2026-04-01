"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProcessNoopBatchButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onClick() {
    setFeedback(null);
    setBusy(true);
    try {
      const res = await fetch("/api/notifications/process-noop-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        summary?: { sent: number; skipped: number; errors: number };
      };

      if (!res.ok) {
        setFeedback({
          kind: "err",
          text:
            typeof data.error === "string" ? data.error : `Request failed (${res.status})`,
        });
        return;
      }

      const s = data.summary;
      const text =
        s != null
          ? `Batch done: ${s.sent} sent, ${s.skipped} skipped, ${s.errors} errors.`
          : "Batch completed.";

      setFeedback({ kind: "ok", text });
      router.refresh();
    } catch (e) {
      setFeedback({
        kind: "err",
        text: e instanceof Error ? e.message : "Network error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? "Processing…" : "Process Test Batch"}
      </button>
      {feedback ? (
        <p
          className={`text-xs ${feedback.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}
          role="status"
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
