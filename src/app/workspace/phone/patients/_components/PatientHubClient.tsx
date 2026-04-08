"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { DialSoftphoneButton } from "@/app/workspace/phone/patients/_components/DialSoftphoneButton";
import {
  scheduleWorkspacePatientVisit,
  sendWorkspaceOnMyWaySms,
  sendWorkspacePatientSms,
} from "@/app/workspace/phone/patients/actions";
import type { OutboundSmsRecipient } from "@/lib/crm/outbound-patient-sms";

const btnPrimary =
  "inline-flex flex-1 min-h-[40px] items-center justify-center rounded-2xl bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40";
const btnGhost =
  "inline-flex flex-1 min-h-[40px] items-center justify-center rounded-2xl border border-sky-200/90 bg-white px-3 py-2 text-xs font-semibold text-phone-ink shadow-sm shadow-sky-950/5 transition hover:bg-phone-ice disabled:cursor-not-allowed disabled:opacity-40";

type Props = {
  patientId: string;
  primaryPhone: string;
  secondaryPhone: string;
  conversationId: string | null;
  copy: {
    reschedule: string;
    confirm: string;
    runningLate: string;
  };
};

export function PatientHubClient({ patientId, primaryPhone, secondaryPhone, conversationId, copy }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [smsRecipient, setSmsRecipient] = useState<OutboundSmsRecipient>("patient");
  const [smsBody, setSmsBody] = useState("");

  const inboxHref = conversationId ? `/workspace/phone/inbox/${conversationId}` : null;

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 4200);
  };

  const onSchedule = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const r = await scheduleWorkspacePatientVisit(fd);
      if (r.ok) {
        showFlash("Visit scheduled.");
        form.reset();
        router.refresh();
      } else {
        showFlash(r.error);
      }
    });
  };

  const sendPreset = (body: string, recipient: OutboundSmsRecipient) => {
    startTransition(async () => {
      const r = await sendWorkspacePatientSms({ patientId, body, recipient });
      if (r.ok) {
        showFlash("Text sent.");
        router.refresh();
      } else {
        showFlash(r.error);
      }
    });
  };

  const onCustomSms = (e: FormEvent) => {
    e.preventDefault();
    if (!smsBody.trim()) return;
    sendPreset(smsBody.trim(), smsRecipient);
    setSmsBody("");
  };

  const onMyWay = () => {
    startTransition(async () => {
      const r = await sendWorkspaceOnMyWaySms(patientId);
      if (r.ok) {
        showFlash("On my way sent.");
        router.refresh();
      } else {
        showFlash(r.error);
      }
    });
  };

  return (
    <div className="space-y-6">
      {flash ? (
        <div className="rounded-2xl bg-sky-50 px-3 py-2 text-center text-xs font-medium text-sky-950 ring-1 ring-sky-100">
          {flash}
        </div>
      ) : null}

      <section className="rounded-3xl border border-sky-100/70 bg-white/95 p-4 shadow-sm shadow-sky-950/5 backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Communicate</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {primaryPhone ? (
            <DialSoftphoneButton e164={primaryPhone} label="Call patient" className={btnPrimary} />
          ) : (
            <span className={`${btnPrimary} cursor-not-allowed opacity-40`}>No patient phone</span>
          )}
          {inboxHref ? (
            <Link href={inboxHref} className={btnGhost}>
              Text patient
            </Link>
          ) : (
            <span className={`${btnGhost} cursor-not-allowed text-slate-400`}>No SMS thread</span>
          )}
          {secondaryPhone ? (
            <DialSoftphoneButton e164={secondaryPhone} label="Call caregiver" className={btnGhost} />
          ) : (
            <span className={`${btnGhost} cursor-not-allowed text-slate-400`}>No alt phone</span>
          )}
          {inboxHref ? (
            <Link href={inboxHref} className={btnGhost}>
              Open thread
            </Link>
          ) : (
            <span className={`${btnGhost} cursor-not-allowed text-slate-400`}>Open thread</span>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-sky-100/60 bg-gradient-to-br from-phone-powder/80 to-white p-4 shadow-sm shadow-sky-950/5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Quick texts</p>
        <p className="mt-1 text-xs text-slate-500">Choose who receives the preset, then tap a message.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["patient", "caregiver", "both"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSmsRecipient(r)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                smsRecipient === r
                  ? "bg-gradient-to-r from-blue-950 to-sky-600 text-white shadow-sm shadow-blue-900/20"
                  : "bg-white text-slate-600 ring-1 ring-sky-200/80 hover:bg-phone-ice"
              }`}
            >
              {r === "patient" ? "Patient" : r === "caregiver" ? "Caregiver" : "Both"}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onMyWay}
            className="rounded-full bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:brightness-105 disabled:opacity-50"
          >
            On my way
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendPreset(copy.confirm, smsRecipient)}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-phone-ink ring-1 ring-sky-200/90 transition hover:bg-phone-ice disabled:opacity-50"
          >
            Please confirm
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendPreset(copy.reschedule, smsRecipient)}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-phone-ink ring-1 ring-sky-200/90 transition hover:bg-phone-ice disabled:opacity-50"
          >
            Need to reschedule
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendPreset(copy.runningLate, smsRecipient)}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-phone-ink ring-1 ring-sky-200/90 transition hover:bg-phone-ice disabled:opacity-50"
          >
            Running late
          </button>
        </div>
        <form onSubmit={onCustomSms} className="mt-4 space-y-2">
          <label className="block text-[11px] font-medium text-slate-500" htmlFor="smsBody">
            Custom message
          </label>
          <textarea
            id="smsBody"
            name="smsBody"
            rows={3}
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
            placeholder="Type a message…"
            className="w-full resize-none rounded-2xl border-0 bg-white/90 px-3 py-2 text-sm text-slate-900 ring-1 ring-sky-200/80 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-phone-ring/80"
          />
          <button type="submit" disabled={pending || !smsBody.trim()} className={`${btnPrimary} w-full`}>
            Send custom text
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-sky-100/70 bg-white/95 p-4 shadow-sm shadow-sky-950/5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Schedule visit</p>
        <form onSubmit={onSchedule} className="mt-3 space-y-3">
          <input type="hidden" name="patientId" value={patientId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              Date
              <input
                name="visitDate"
                type="date"
                required
                className="mt-1 w-full rounded-2xl border-0 bg-phone-ice/60 px-3 py-2 text-sm text-slate-900 ring-1 ring-sky-200/80 focus:outline-none focus:ring-2 focus:ring-phone-ring/80"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Time
              <input
                name="visitTime"
                type="time"
                required
                className="mt-1 w-full rounded-2xl border-0 bg-phone-ice/60 px-3 py-2 text-sm text-slate-900 ring-1 ring-sky-200/80 focus:outline-none focus:ring-2 focus:ring-phone-ring/80"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-600">
            Note (optional)
            <input
              name="visitNote"
              type="text"
              className="mt-1 w-full rounded-2xl border-0 bg-phone-ice/60 px-3 py-2 text-sm text-slate-900 ring-1 ring-sky-200/80 focus:outline-none focus:ring-2 focus:ring-phone-ring/80"
              placeholder="Gate code, pet, focus…"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Reminder texts go to
            <select
              name="reminderRecipient"
              defaultValue="patient"
              className="mt-1 w-full rounded-2xl border-0 bg-phone-ice/60 px-3 py-2 text-sm text-slate-900 ring-1 ring-sky-200/80 focus:outline-none focus:ring-2 focus:ring-phone-ring/80"
            >
              <option value="patient">Patient</option>
              <option value="caregiver">Caregiver</option>
              <option value="both">Both</option>
            </select>
          </label>
          <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
            {pending ? "Saving…" : "Save visit"}
          </button>
        </form>
      </section>
    </div>
  );
}
