"use client";

import { useState } from "react";

import type { PacketRequestCard } from "@/lib/crm/facility-packet-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FacilityPacketConfirmReceivedModalProps = {
  request: PacketRequestCard;
  onDone?: () => void;
  className?: string;
};

export function FacilityPacketConfirmReceivedModal({ request, onDone, className }: FacilityPacketConfirmReceivedModalProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/packet-requests/${request.id}/confirm-received`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || null }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!data.ok) {
        setError("Could not confirm receipt.");
        return;
      }
      setOpen(false);
      onDone?.();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Confirm Received
      </button>
      {open ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Confirm packet received</h3>
            <p className="mt-1 text-sm text-slate-600">{request.facility_name}</p>
            <label className="mt-4 block text-xs font-semibold uppercase text-slate-500">
              Note (optional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${crmFilterInputCls} mt-1 w-full`} placeholder="Who confirmed? Any feedback?" />
            </label>
            {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button type="button" disabled={saving} onClick={() => void submit()} className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
