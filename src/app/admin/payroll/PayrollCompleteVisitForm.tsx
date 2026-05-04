"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { recordVisitCompletionAction } from "./actions";
import { parseAppDateTimeInputToUtcIso } from "@/lib/datetime/app-timezone";

export function PayrollCompleteVisitForm({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!checkIn || !checkOut) return;
    setPending(true);
    try {
      const ci = parseAppDateTimeInputToUtcIso(checkIn);
      const co = parseAppDateTimeInputToUtcIso(checkOut);
      if (!ci || !co) return;
      const fd = new FormData();
      fd.set("visitId", visitId);
      fd.set("checkIn", ci);
      fd.set("checkOut", co);
      if (note) fd.set("noteCompleted", "on");
      const r = await recordVisitCompletionAction(fd);
      if (r.ok) {
        router.refresh();
        setCheckIn("");
        setCheckOut("");
        setNote(false);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
      <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-600">
        Check-in
        <input
          type="datetime-local"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-900"
          required
        />
      </label>
      <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] font-semibold text-slate-600">
        Check-out
        <input
          type="datetime-local"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-900"
          required
        />
      </label>
      <label className="flex items-center gap-2 pb-1 text-[11px] font-semibold text-slate-600">
        <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />
        Note done
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark completed"}
      </button>
    </form>
  );
}
