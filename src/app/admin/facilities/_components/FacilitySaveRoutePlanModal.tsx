"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  clearFacilityRouteDraft,
  draftStopsToCreateInput,
  getFacilityRouteDraft,
  notifyRouteDraftChanged,
} from "@/lib/crm/facility-route-draft";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type StaffOption = { user_id: string; label: string };

type FacilitySaveRoutePlanModalProps = {
  open: boolean;
  onClose: () => void;
  staffOptions?: StaffOption[];
  currentUserId: string;
  canAssignOthers?: boolean;
  startLatitude?: number | null;
  startLongitude?: number | null;
  startAddress?: string | null;
  onSaved?: (routeId: string) => void;
};

export function FacilitySaveRoutePlanModal({
  open,
  onClose,
  staffOptions = [],
  currentUserId,
  canAssignOthers = false,
  startLatitude,
  startLongitude,
  startAddress,
  onSaved,
}: FacilitySaveRoutePlanModalProps) {
  const [name, setName] = useState("Today's Outreach Route");
  const [routeDate, setRouteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assignedTo, setAssignedTo] = useState(currentUserId);
  const [notes, setNotes] = useState("");
  const [clearDraft, setClearDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const stopCount = getFacilityRouteDraft().stops.length;

  useEffect(() => {
    if (open) {
      setName("Today's Outreach Route");
      setRouteDate(new Date().toISOString().slice(0, 10));
      setAssignedTo(currentUserId);
      setNotes("");
      setClearDraft(false);
      setError(null);
      setSuccessId(null);
    }
  }, [open, currentUserId]);

  if (!open) return null;

  async function submit() {
    const draft = getFacilityRouteDraft();
    if (!draft.stops.length) {
      setError("Add at least one stop before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/facilities/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          route_date: routeDate,
          assigned_rep_id: assignedTo,
          notes: notes.trim() || null,
          start_latitude: startLatitude ?? null,
          start_longitude: startLongitude ?? null,
          start_address: startAddress ?? null,
          status: "planned",
          stops: draftStopsToCreateInput(draft.stops),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!data.ok || !data.id) {
        setError(data.error ?? "Could not save route.");
        return;
      }
      if (clearDraft) {
        clearFacilityRouteDraft();
        notifyRouteDraftChanged();
      }
      setSuccessId(data.id);
      onSaved?.(data.id);
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">Save route plan</h3>
        <p className="mt-1 text-sm text-slate-600">{stopCount} stop{stopCount === 1 ? "" : "s"} from your route draft</p>

        {successId ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-emerald-800">Route saved successfully.</p>
            <Link
              href={`/admin/facilities/routes/${successId}`}
              className="block rounded-lg border border-teal-600 bg-teal-600 px-3 py-2 text-center text-sm font-semibold text-white"
            >
              Open route plan
            </Link>
            <button type="button" onClick={onClose} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">
              Close
            </button>
          </div>
        ) : (
          <>
            <label className="mt-4 block text-xs font-semibold uppercase text-slate-500">
              Route name
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
            </label>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              Route date
              <input type="date" value={routeDate} onChange={(e) => setRouteDate(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
            </label>
            {canAssignOthers ? (
              <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                Assigned rep
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`}>
                  {staffOptions.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${crmFilterInputCls} mt-1 w-full`} />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={clearDraft} onChange={(e) => setClearDraft(e.target.checked)} />
              Clear draft after save
            </label>
            {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !name.trim()}
                onClick={() => void submit()}
                className="rounded-lg border border-teal-600 bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Route Plan"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
