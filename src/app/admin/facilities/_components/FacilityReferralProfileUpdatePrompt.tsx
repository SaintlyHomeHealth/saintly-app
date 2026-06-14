"use client";

import { useState } from "react";

import type { ReferralProfileUpdateFromActivityPrompt } from "@/lib/crm/facility-referral-profile-types";
import { FACILITY_PREFERRED_METHODS } from "@/lib/crm/facility-referral-profile-types";

type FacilityReferralProfileUpdatePromptProps = {
  facilityId: string;
  facilityName: string;
  suggestion: ReferralProfileUpdateFromActivityPrompt;
  onClose: () => void;
  onApplied?: () => void;
};

export function FacilityReferralProfileUpdatePrompt({
  facilityId,
  facilityName,
  suggestion,
  onClose,
  onApplied,
}: FacilityReferralProfileUpdatePromptProps) {
  const [referralProcess, setReferralProcess] = useState(suggestion.referral_process ?? "");
  const [preferredMethod, setPreferredMethod] = useState(suggestion.preferred_referral_method ?? "");
  const [bestContact, setBestContact] = useState(suggestion.best_contact_name ?? "");
  const [fax, setFax] = useState(suggestion.referral_fax ?? "");
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    const res = await fetch(`/api/facilities/${facilityId}/referral-profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referral_process: referralProcess.trim() || null,
        preferred_referral_method: preferredMethod || null,
        decision_maker_name: bestContact.trim() || null,
        referral_fax: fax.trim() || null,
        referral_email: suggestion.referral_email,
        referral_phone: suggestion.referral_phone,
      }),
    });
    setSaving(false);
    if (res.ok) {
      onApplied?.();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <p className="text-[11px] font-bold uppercase text-violet-700">Referral process captured</p>
        <h2 className="mt-1 text-base font-semibold text-slate-900">{facilityName}</h2>
        <p className="mt-2 text-sm text-slate-600">
          Update referral source profile with this referral process?
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            Referral process
            <textarea
              value={referralProcess}
              onChange={(e) => setReferralProcess(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Preferred referral method
            <select
              value={preferredMethod}
              onChange={(e) => setPreferredMethod(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {FACILITY_PREFERRED_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Best contact
            <input
              value={bestContact}
              onChange={(e) => setBestContact(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          {fax ? (
            <label className="block text-xs font-semibold text-slate-600">
              Referral fax
              <input value={fax} onChange={(e) => setFax(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
          ) : null}
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">
            Skip
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleConfirm()}
            className="flex-[2] rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Update Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
