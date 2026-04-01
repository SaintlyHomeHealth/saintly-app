"use client";

import { useState } from "react";

type Props = {
  phoneCallId: string;
  disabled?: boolean;
};

export function CallLogCreateLeadButton({ phoneCallId, disabled }: Props) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreateLead() {
    setErr(null);
    setPending(true);
    try {
      const res = await fetch("/api/leads/create-from-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneCallId, source: "phone" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErr(data.error ?? "Could not create lead");
        setPending(false);
        return;
      }
      window.location.reload();
    } catch {
      setErr("Network error");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => void handleCreateLead()}
        className="text-left text-[11px] font-semibold text-sky-700 underline decoration-sky-400 underline-offset-2 hover:text-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create lead"}
      </button>
      {err ? <span className="max-w-[9rem] text-right text-[10px] text-red-600">{err}</span> : null}
    </div>
  );
}
