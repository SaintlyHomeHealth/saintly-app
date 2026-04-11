"use client";

import { useState } from "react";

import { submitWeeklyPayrollAction } from "./actions";

export function SubmitWeeklyPayrollButton({ disabled }: { disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    setMessage(null);
    setPending(true);
    try {
      const r = await submitWeeklyPayrollAction();
      if (r.ok) {
        setMessage("Weekly payroll submitted.");
      } else {
        setMessage(r.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={onClick}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:from-sky-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Submitting…" : "Submit weekly payroll"}
      </button>
      {message ? (
        <p className={`text-sm ${message.startsWith("Weekly payroll submitted") ? "text-emerald-700" : "text-rose-700"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
