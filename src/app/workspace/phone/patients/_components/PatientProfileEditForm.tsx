"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { updateWorkspacePatientOperationalProfile } from "@/app/workspace/phone/patients/actions";
import { FormattedPhoneInput } from "@/components/phone/FormattedPhoneInput";

type Initial = {
  full_name: string;
  primary_phone: string;
  secondary_phone: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  zip: string;
  patient_notes: string;
};

const labelCls = "block text-[11px] font-medium text-slate-500";
const inputCls =
  "mt-1 w-full rounded-2xl border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-sky-200/80 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-phone-ring/80";

type Props = {
  patientId: string;
  initial: Initial;
};

export function PatientProfileEditForm({ patientId, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await updateWorkspacePatientOperationalProfile(fd);
      if (r.ok) {
        setFlash("Saved.");
        router.refresh();
      } else {
        setFlash(r.error);
      }
      window.setTimeout(() => setFlash(null), 4000);
    });
  };

  return (
    <section className="rounded-3xl bg-white/90 p-4 shadow-sm shadow-slate-200/40 ring-1 ring-slate-200/50">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Update on file</p>
          <p className="mt-1 text-xs text-slate-500">
            Address, phones, and visit notes. Changes are visible to the care team and logged for review.
          </p>
        </div>
      </div>
      {flash ? (
        <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-center text-xs font-medium text-sky-950 ring-1 ring-sky-100">
          {flash}
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input type="hidden" name="patientId" value={patientId} />
        <label className={labelCls}>
          Full name
          <input name="full_name" className={inputCls} defaultValue={initial.full_name} autoComplete="name" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Patient phone
            <FormattedPhoneInput
              name="primary_phone"
              className={inputCls}
              defaultValue={initial.primary_phone}
              autoComplete="tel"
            />
          </label>
          <label className={labelCls}>
            Caregiver / alternate
            <FormattedPhoneInput
              name="secondary_phone"
              className={inputCls}
              defaultValue={initial.secondary_phone}
              autoComplete="tel"
            />
          </label>
        </div>
        <label className={labelCls}>
          Street line 1
          <input name="address_line_1" className={inputCls} defaultValue={initial.address_line_1} />
        </label>
        <label className={labelCls}>
          Street line 2
          <input name="address_line_2" className={inputCls} defaultValue={initial.address_line_2} />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={`${labelCls} col-span-2 sm:col-span-2`}>
            City
            <input name="city" className={inputCls} defaultValue={initial.city} />
          </label>
          <label className={labelCls}>
            State
            <input name="state" className={inputCls} defaultValue={initial.state} />
          </label>
          <label className={labelCls}>
            ZIP
            <input name="zip" className={inputCls} defaultValue={initial.zip} />
          </label>
        </div>
        <label className={labelCls}>
          Visit / access notes
          <textarea
            name="patient_notes"
            rows={3}
            className={`${inputCls} resize-none`}
            defaultValue={initial.patient_notes}
            placeholder="Gate, pets, parking, preferences…"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:brightness-105 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save updates"}
        </button>
      </form>
    </section>
  );
}
