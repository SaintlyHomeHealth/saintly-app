"use client";

import { useEffect, useState } from "react";

import type { BulkEnrollResult, CampaignCard } from "@/lib/crm/facility-playbook-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FacilityEnrollCampaignModalProps = {
  open: boolean;
  onClose: () => void;
  facilityId: string;
  facilityName: string;
  onEnrolled?: (result: BulkEnrollResult) => void;
};

export function FacilityEnrollCampaignModal({
  open,
  onClose,
  facilityId,
  facilityName,
  onEnrolled,
}: FacilityEnrollCampaignModalProps) {
  const [campaigns, setCampaigns] = useState<CampaignCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedId("");
      setError(null);
      setMessage(null);
      return;
    }
    setLoading(true);
    void fetch("/api/facilities/campaigns")
      .then((r) => r.json())
      .then((d: { ok: boolean; campaigns?: CampaignCard[] }) => {
        if (d.ok) {
          const active = (d.campaigns ?? []).filter((c) => c.status === "active" || c.status === "draft");
          setCampaigns(active);
        }
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function enroll() {
    if (!selectedId) return;
    setEnrolling(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/campaigns/${selectedId}/enroll-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facility_ids: [facilityId], skip_existing: true }),
      });
      const data = (await res.json()) as BulkEnrollResult & { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error === "campaign_closed" ? "That campaign is closed." : "Enrollment failed.");
        return;
      }
      if (data.enrolled_count === 0 && data.skipped_existing_count === 1) {
        setMessage("Already enrolled in that campaign.");
      } else {
        setMessage(`Enrolled ${facilityName} in campaign.`);
        onEnrolled?.(data);
        window.setTimeout(onClose, 1200);
      }
    } catch {
      setError("Network error.");
    } finally {
      setEnrolling(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-3xl">
        <p className="text-[11px] font-bold uppercase tracking-wide text-pink-800">Enroll in campaign</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{facilityName}</h2>

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No active campaigns available.</p>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={`${crmFilterInputCls} mt-4 w-full`}
          >
            <option value="">Choose campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.playbook_name ?? "Playbook"})
              </option>
            ))}
          </select>
        )}

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-800">{message}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedId || enrolling}
            onClick={() => void enroll()}
            className="rounded-lg border border-pink-600 bg-pink-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {enrolling ? "Enrolling…" : "Enroll"}
          </button>
        </div>
      </div>
    </div>
  );
}
