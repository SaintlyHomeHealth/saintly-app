"use client";

import { useState } from "react";

import { ROUTE_SKIP_REASONS } from "@/lib/crm/facility-route-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FacilitySkipStopModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: { skip_reason: string; notes: string }) => Promise<void>;
};

export function FacilitySkipStopModal({ open, onClose, onConfirm }: FacilitySkipStopModalProps) {
  const [reason, setReason] = useState<string>(ROUTE_SKIP_REASONS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-bold text-slate-900">Skip stop</h3>
        <label className="mt-4 block text-xs font-semibold uppercase text-slate-500">
          Reason
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`}>
            {ROUTE_SKIP_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${crmFilterInputCls} mt-1 w-full`} />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onConfirm({ skip_reason: reason, notes: notes.trim() }).finally(() => setSaving(false));
            }}
            className="rounded-lg border border-rose-600 bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Skip Stop"}
          </button>
        </div>
      </div>
    </div>
  );
}
