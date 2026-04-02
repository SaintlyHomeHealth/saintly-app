"use client";

import { useMemo, useState } from "react";

import { scheduleVisitFromDispatch } from "../actions";
import { buildDispatchVisitTimeSlots } from "@/lib/crm/dispatch-time-slots";

export type ScheduleVisitPatientOption = { id: string; label: string };
export type ScheduleVisitStaffOption = { user_id: string; label: string };

type Props = {
  patients: ScheduleVisitPatientOption[];
  staff: ScheduleVisitStaffOption[];
  defaultPatientId?: string;
};

const TIME_SLOTS = buildDispatchVisitTimeSlots();

const PRESET_SUMMARY: Record<"morning" | "midday" | "afternoon", string> = {
  morning: "8:00 AM – 11:00 AM · 3-hour window",
  midday: "11:00 AM – 2:00 PM · 3-hour window",
  afternoon: "2:00 PM – 5:00 PM · 3-hour window",
};

export function ScheduleVisitModal({ patients, staff, defaultPatientId }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"exact" | "window">("exact");
  const [preset, setPreset] = useState<"morning" | "midday" | "afternoon" | "custom">("morning");

  const defaultTime = useMemo(() => "09:00", []);

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

              <div>
                <label className="block text-xs font-semibold text-slate-700">Clinician / nurse</label>
                <select
                  name="assignedUserId"
                  className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  defaultValue=""
                >
                  <option value="">Unassigned (will appear in Needs attention)</option>
                  {staff.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  Leave unassigned only when someone will assign a nurse from dispatch; unassigned active visits are
                  flagged automatically.
                </p>
              </div>

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
                  Exact time (15-minute slots)
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
                  <select
                    name="visitTime"
                    required
                    defaultValue={defaultTime}
                    className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="space-y-2 rounded-[14px] border border-slate-100 bg-slate-50/80 p-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    Window preset
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
                      <option value="custom">Custom start & end (15-min slots)</option>
                    </select>
                  </label>
                  {preset !== "custom" ? (
                    <p className="text-xs font-medium text-slate-700">{PRESET_SUMMARY[preset]}</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Start
                        <select
                          name="windowStart"
                          required
                          defaultValue="08:00"
                          className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-2 py-2 text-sm"
                        >
                          {TIME_SLOTS.map((s) => (
                            <option key={`ws-${s.value}`} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-slate-700">
                        End
                        <select
                          name="windowEnd"
                          required
                          defaultValue="11:00"
                          className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-2 py-2 text-sm"
                        >
                          {TIME_SLOTS.map((s) => (
                            <option key={`we-${s.value}`} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
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
