"use client";

import { useState } from "react";

import { refreshPayrollDashboardAction } from "./actions";

export function PayrollDashboardActions() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onRefresh() {
    setMessage(null);
    setPending(true);
    try {
      const r = await refreshPayrollDashboardAction();
      if (r.ok) {
        setMessage("Updated from the server.");
      } else {
        setMessage(r.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          disabled={pending}
          onClick={onRefresh}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Refreshing…" : "Refresh payroll view"}
        </button>
        <p className="max-w-xl text-xs leading-relaxed text-slate-600">
          Questions or wrong amounts?{" "}
          <span className="font-semibold text-slate-800">Contact your scheduler or HR.</span> This reloads what you see here; it does not
          change visits in Alora.
        </p>
      </div>
      {message ? (
        <p className={`text-xs ${message.startsWith("Updated") ? "text-emerald-700" : "text-rose-700"}`}>{message}</p>
      ) : null}
    </div>
  );
}
