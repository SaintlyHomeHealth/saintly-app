"use client";

import { useState, useTransition } from "react";

import { NURSE_ON_THE_WAY_MESSAGE } from "@/lib/crm/patient-sms";
import { sendNurseOnTheWaySms, sendPatientSms } from "../actions";

export function PatientSmsForm({ patientId, disabled }: { patientId: string; disabled?: boolean }) {
  const otwTitle =
    "Sends a preset SMS to the patient (not the nurse) that their nurse is on the way. Requires a primary phone on the contact.";
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inputCls =
    "mt-1 w-full max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 shadow-sm placeholder:text-slate-400";
  const btnCls =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50";
  const btnPrimary =
    "rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-50";
  const btnNurse =
    "rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-sky-900 shadow-sm hover:bg-sky-50 disabled:opacity-50";

  function sendNurseOnTheWay() {
    setFeedback(null);
    startTransition(async () => {
      const r = await sendNurseOnTheWaySms(patientId);
      if (r.ok) {
        setFeedback("Sent.");
      } else {
        setFeedback(r.error);
      }
    });
  }

  function send() {
    setFeedback(null);
    startTransition(async () => {
      const r = await sendPatientSms(patientId, message);
      if (r.ok) {
        setFeedback("Sent.");
        setMessage("");
      } else {
        setFeedback(r.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="flex min-w-[200px] flex-col gap-1">
        <button
          type="button"
          className={btnNurse}
          disabled={disabled || isPending}
          title={disabled ? "Add a primary phone on the contact first" : otwTitle}
          onClick={sendNurseOnTheWay}
        >
          Nurse OTW (patient SMS)
        </button>
        <button
          type="button"
          className={btnCls}
          disabled={disabled}
          title={disabled ? "Add a primary phone on the contact first" : undefined}
          onClick={() => setOpen(true)}
        >
          Text patient
        </button>
        {feedback ? <p className="text-[11px] text-slate-600">{feedback}</p> : null}
      </div>
    );
  }

  return (
    <div className="min-w-[200px] space-y-1">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className={btnNurse}
          disabled={disabled || isPending}
          title={disabled ? "Add a primary phone on the contact first" : otwTitle}
          onClick={sendNurseOnTheWay}
        >
          Nurse OTW (patient SMS)
        </button>
        <button type="button" className={btnCls} disabled={disabled} onClick={() => setOpen(false)}>
          Hide custom text
        </button>
      </div>
      <textarea
        className={inputCls}
        rows={2}
        value={message}
        placeholder={NURSE_ON_THE_WAY_MESSAGE}
        disabled={isPending}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex flex-wrap gap-1">
        <button type="button" className={btnPrimary} disabled={isPending} onClick={send}>
          Send
        </button>
        <button
          type="button"
          className={btnCls}
          disabled={isPending}
          onClick={() => {
            setOpen(false);
            setFeedback(null);
          }}
        >
          Close
        </button>
      </div>
      {feedback ? <p className="text-[11px] text-slate-600">{feedback}</p> : null}
    </div>
  );
}
