"use client";

import { useState } from "react";

import { FACILITY_REFERRAL_LOST_REASONS } from "@/lib/crm/facility-referral-pipeline-types";
import { FACILITY_REFERRAL_PIPELINE_STAGES } from "@/lib/crm/facility-referral-pipeline-types";
import { leadStatusForPipelineStage } from "@/lib/crm/facility-referral-pipeline-utils";

type FacilityReferralStatusModalProps = {
  open: boolean;
  leadId: string;
  currentStageKey?: string;
  onClose: () => void;
  onSaved?: () => void;
};

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200";

export function FacilityReferralStatusModal({
  open,
  leadId,
  currentStageKey,
  onClose,
  onSaved,
}: FacilityReferralStatusModalProps) {
  const [stageKey, setStageKey] = useState(currentStageKey ?? "new_referral");
  const [note, setNote] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isLost = stageKey === "lost";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLost && !lostReason.trim()) {
      setError("Lost reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const stage = FACILITY_REFERRAL_PIPELINE_STAGES.find((s) => s.key === stageKey);
      const res = await fetch(`/api/facilities/referrals/${leadId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: stage?.label ?? leadStatusForPipelineStage(stageKey as never),
          note: note.trim() || undefined,
          lost_reason: isLost ? lostReason.trim() : null,
          create_source_follow_up: createFollowUp,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error === "lost_reason_required" ? "Lost reason is required." : "Could not update status.");
        return;
      }
      onSaved?.();
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">Update referral status</h2>
        <form className="mt-4 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <label className="text-xs font-semibold text-slate-600">New status</label>
            <select className={inputCls} value={stageKey} onChange={(e) => setStageKey(e.target.value)}>
              {FACILITY_REFERRAL_PIPELINE_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {isLost ? (
            <div>
              <label className="text-xs font-semibold text-slate-600">Lost reason</label>
              <select className={inputCls} value={lostReason} onChange={(e) => setLostReason(e.target.value)} required>
                <option value="">— Select —</option>
                {FACILITY_REFERRAL_LOST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="text-xs font-semibold text-slate-600">Note</label>
            <textarea className={`${inputCls} min-h-[4rem]`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={createFollowUp} onChange={(e) => setCreateFollowUp(e.target.checked)} />
            Create source follow-up task when appropriate
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save status"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
