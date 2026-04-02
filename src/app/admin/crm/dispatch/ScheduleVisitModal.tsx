"use client";

import { useState } from "react";

import { scheduleVisitFromDispatch } from "../actions";

export type ScheduleVisitPatientOption = { id: string; label: string };
export type ScheduleVisitStaffOption = { user_id: string; label: string };

type Props = {
  patients: ScheduleVisitPatientOption[];
  staff: ScheduleVisitStaffOption[];
  defaultPatientId?: string;
};

export function ScheduleVisitModal({ patients, staff, defaultPatientId }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"exact" | "window">("exact");
  const [preset, setPreset] = useState<"morning" | "midday" | "afternoon" | "custom">("morning");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
      >
        + Schedule visit
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dispatch-schedule-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 id="dispatch-schedule-title" className="text-base font-semibold text-slate-900">
                Schedule visit
              </h2>
              <p className="mt-1 text-xs text-slate-500">Creates a shared dispatch row visible in admin and workspace.</p>
            </div>

            <form
              key={defaultPatientId ?? "default"}
              action={scheduleVisitFromDispatch}
              className="space-y-4 px-5 py-4"
            >
              <label className="block text-xs font-semibold text-slate-700">
                Patient
                <select
                  name="patientId"
                  required
                  defaultValue={defaultPatientId ?? ""}
                  className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="" disabled>
                    Select patient
                  </option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                Clinician / nurse (optional)
                <select
                  name="assignedUserId"
                  className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  defaultValue=""
                >
                  <option value="">Unassigned</option>
                  {staff.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-700">
                Date
                <input
                  name="visitDate"
                  type="date"
                  required
                  className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-slate-700">Scheduling mode</legend>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="scheduleMode"
                    value="exact"
                    checked={mode === "exact"}
                    onChange={() => setMode("exact")}
                  />
                  Exact time
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="scheduleMode"
                    value="window"
                    checked={mode === "window"}
                    onChange={() => setMode("window")}
                  />
                  3-hour window
                </label>
              </fieldset>

              {mode === "window" ? <input type="hidden" name="windowPreset" value={preset} /> : null}

              {mode === "exact" ? (
                <label className="block text-xs font-semibold text-slate-700">
                  Time
                  <input
                    name="visitTime"
                    type="time"
                    required
                    className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Window
                    <select
                      className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      value={preset}
                      onChange={(e) =>
                        setPreset(e.target.value as "morning" | "midday" | "afternoon" | "custom")
                      }
                    >
                      <option value="morning">8:00 AM – 11:00 AM</option>
                      <option value="midday">11:00 AM – 2:00 PM</option>
                      <option value="afternoon">2:00 PM – 5:00 PM</option>
                      <option value="custom">Custom times</option>
                    </select>
                  </label>
                  {preset === "custom" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Start
                        <input
                          name="windowStart"
                          type="time"
                          required
                          className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-700">
                        End
                        <input
                          name="windowEnd"
                          type="time"
                          required
                          className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              )}

              <label className="block text-xs font-semibold text-slate-700">
                Notes (optional)
                <textarea
                  name="visitNote"
                  rows={2}
                  className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <div className="flex flex-col gap-2 text-sm text-slate-800">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="notifyPatient" value="1" />
                  Notify patient by SMS
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="notifyClinician" value="1" />
                  Notify clinician by SMS (requires dispatch number on Staff Access)
                </label>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  className="inline-flex flex-1 items-center justify-center rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Save visit
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
