"use client";

import { useState } from "react";

import type { FollowUpTaskCard } from "@/lib/crm/facility-follow-up-task-types";
import {
  calendarDateToDueIso,
  dueIsoFromPreset,
  RESCHEDULE_PRESETS,
  SNOOZE_PRESETS,
  type FollowUpTaskActionMode,
} from "@/lib/crm/facility-follow-up-task-client";

type FacilityFollowUpTaskModalProps = {
  open: boolean;
  mode: FollowUpTaskActionMode;
  task: FollowUpTaskCard | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

const overlayCls = "fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center";
const panelCls =
  "w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl";
const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200";
const btnPrimary =
  "inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm";
const btnGhost =
  "inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800";

export function FacilityFollowUpTaskModal({
  open,
  mode,
  task,
  onClose,
  onDone,
}: FacilityFollowUpTaskModalProps) {
  const [completionNote, setCompletionNote] = useState("");
  const [createActivity, setCreateActivity] = useState(true);
  const [reason, setReason] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !task) return null;

  async function submitComplete() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/follow-up-tasks/${task!.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completion_note: completionNote.trim() || null,
          create_activity: createActivity,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError("Could not complete task. Try again.");
        return;
      }
      onDone("Follow-up completed.");
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function submitSnooze(untilIso: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/follow-up-tasks/${task!.id}/snooze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozed_until: untilIso, reason: reason.trim() || null }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (!data.ok) {
        setError("Could not snooze task.");
        return;
      }
      onDone("Follow-up snoozed.");
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReschedule(dueIso: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/follow-up-tasks/${task!.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_at: dueIso, note: reason.trim() || null }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (!data.ok) {
        setError("Could not reschedule task.");
        return;
      }
      onDone("Follow-up rescheduled.");
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCancel() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/follow-up-tasks/${task!.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (!data.ok) {
        setError("Could not cancel task.");
        return;
      }
      onDone("Follow-up canceled.");
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const titles: Record<FollowUpTaskActionMode, string> = {
    complete: "Complete Follow-Up",
    snooze: "Snooze Follow-Up",
    reschedule: "Reschedule Follow-Up",
    cancel: "Cancel Follow-Up",
  };

  return (
    <div className={overlayCls} role="dialog" aria-modal="true">
      <div className={panelCls}>
        <h2 className="text-lg font-bold text-slate-900">{titles[mode]}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {task.facility_name} — {task.title}
        </p>

        {mode === "complete" ? (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Completion note
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                className={`${inputCls} min-h-[4rem]`}
                placeholder="Called and left voicemail."
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={createActivity}
                onChange={(e) => setCreateActivity(e.target.checked)}
                className="rounded border-slate-300"
              />
              Create activity log
            </label>
          </div>
        ) : null}

        {mode === "snooze" || mode === "reschedule" ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(mode === "snooze" ? SNOOZE_PRESETS : RESCHEDULE_PRESETS).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    mode === "snooze"
                      ? submitSnooze(dueIsoFromPreset(p.id === "tomorrow" ? "tomorrow" : p.id === "3days" ? "3days" : "1week"))
                      : submitReschedule(dueIsoFromPreset(p.id))
                  }
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-sky-300 hover:bg-sky-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Custom date
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className={inputCls}
              />
            </label>
            {customDate ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const iso = calendarDateToDueIso(customDate);
                  if (mode === "snooze") submitSnooze(iso);
                  else submitReschedule(iso);
                }}
                className={`${btnPrimary} w-full`}
              >
                Use custom date
              </button>
            ) : null}
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {mode === "snooze" ? "Reason (optional)" : "Note (optional)"}
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        ) : null}

        {mode === "cancel" ? (
          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Reason (optional)
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button type="button" className={btnGhost} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {mode === "complete" ? (
            <button type="button" className={btnPrimary} onClick={submitComplete} disabled={saving}>
              {saving ? "Saving…" : "Complete Task"}
            </button>
          ) : null}
          {mode === "cancel" ? (
            <button
              type="button"
              className={`${btnPrimary} !from-rose-600 !to-rose-500`}
              onClick={submitCancel}
              disabled={saving}
            >
              {saving ? "Saving…" : "Cancel Task"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
