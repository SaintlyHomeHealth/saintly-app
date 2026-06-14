"use client";

import { useState } from "react";

import {
  calendarDateToDueIso,
  dueIsoFromPreset,
} from "@/lib/crm/facility-follow-up-task-client";
import { getCrmCalendarTomorrowIso } from "@/lib/crm/crm-local-date";

type StaffOption = { user_id: string; label: string };

type FacilityCreateFollowUpTaskModalProps = {
  open: boolean;
  facilityId: string;
  facilityName: string;
  contacts?: { id: string; name: string }[];
  staffOptions?: StaffOption[];
  defaultAssignedTo?: string | null;
  onClose: () => void;
  onCreated: () => void;
  onToast?: (message: string) => void;
};

const overlayCls = "fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center";
const panelCls = "w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl";
const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200";
const btnPrimary =
  "inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm";

export function FacilityCreateFollowUpTaskModal({
  open,
  facilityId,
  facilityName,
  contacts = [],
  staffOptions = [],
  defaultAssignedTo,
  onClose,
  onCreated,
  onToast,
}: FacilityCreateFollowUpTaskModalProps) {
  const [title, setTitle] = useState("Follow up with facility");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(getCrmCalendarTomorrowIso());
  const [priority, setPriority] = useState("Normal");
  const [contactId, setContactId] = useState("");
  const [assignedTo, setAssignedTo] = useState(defaultAssignedTo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    if (!dueDate) {
      setError("Due date is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/facilities/follow-up-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility_id: facilityId,
          contact_id: contactId || null,
          title: title.trim(),
          description: description.trim() || null,
          due_at: calendarDateToDueIso(dueDate),
          priority,
          assigned_to: assignedTo || null,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError("Could not create task. Try again.");
        return;
      }
      onToast?.("Follow-up task created.");
      onCreated();
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={overlayCls} role="dialog" aria-modal="true">
      <div className={panelCls}>
        <h2 className="text-lg font-bold text-slate-900">Create Follow-Up Task</h2>
        <p className="mt-1 text-sm text-slate-600">{facilityName}</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Task title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              required
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputCls} min-h-[3rem]`}
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
              required
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {(["tomorrow", "3days", "1week"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  const iso = dueIsoFromPreset(p);
                  setDueDate(iso.slice(0, 10));
                }}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {p === "tomorrow" ? "Tomorrow" : p === "3days" ? "3 days" : "1 week"}
              </button>
            ))}
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
            </select>
          </label>

          {contacts.length > 0 ? (
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contact
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {staffOptions.length > 0 ? (
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Assigned to
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputCls}>
                <option value="">Default (facility rep)</option>
                {staffOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={`${btnPrimary} flex-1`}>
              {saving ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
