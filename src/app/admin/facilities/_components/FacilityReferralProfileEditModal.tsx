"use client";

import { useState } from "react";

import type { FacilityReferralProfileSummary } from "@/lib/crm/facility-referral-profile-types";
import {
  FACILITY_PREFERRED_METHODS,
  FACILITY_PROFILE_REFERRAL_POTENTIALS,
  FACILITY_RELATIONSHIP_STATUSES,
} from "@/lib/crm/facility-referral-profile-types";

type ContactOption = { id: string; name: string };

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm";
const labelCls = "block text-xs font-semibold text-slate-600";

type FacilityReferralProfileEditModalProps = {
  facilityId: string;
  facilityName: string;
  summary: FacilityReferralProfileSummary;
  contacts: ContactOption[];
  onClose: () => void;
  onSaved: (summary: FacilityReferralProfileSummary) => void;
};

export function FacilityReferralProfileEditModal({
  facilityId,
  summary,
  contacts,
  onClose,
  onSaved,
}: FacilityReferralProfileEditModalProps) {
  const p = summary.profile;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerTask, setOfferTask] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const servicesRaw = String(fd.get("services_likely_to_refer") ?? "");
    const services = servicesRaw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const body = {
      relationship_status: String(fd.get("relationship_status") ?? "") || null,
      referral_potential: String(fd.get("referral_potential") ?? "") || null,
      best_contact_id: String(fd.get("best_contact_id") ?? "") || null,
      referral_process: String(fd.get("referral_process") ?? "").trim() || null,
      preferred_contact_method: String(fd.get("preferred_contact_method") ?? "") || null,
      preferred_packet_method: String(fd.get("preferred_packet_method") ?? "") || null,
      preferred_referral_method: String(fd.get("preferred_referral_method") ?? "") || null,
      referral_fax: String(fd.get("referral_fax") ?? "").trim() || null,
      referral_email: String(fd.get("referral_email") ?? "").trim() || null,
      referral_phone: String(fd.get("referral_phone") ?? "").trim() || null,
      services_likely_to_refer: services.length ? services : null,
      payer_notes: String(fd.get("payer_notes") ?? "").trim() || null,
      objections: String(fd.get("objections") ?? "").trim() || null,
      opportunities: String(fd.get("opportunities") ?? "").trim() || null,
      next_best_action: String(fd.get("next_best_action") ?? "").trim() || null,
      next_best_action_due_at: String(fd.get("next_best_action_due_at") ?? "") || null,
      decision_maker_name: String(fd.get("decision_maker_name") ?? "").trim() || null,
      decision_maker_role: String(fd.get("decision_maker_role") ?? "").trim() || null,
      gatekeeper_notes: String(fd.get("gatekeeper_notes") ?? "").trim() || null,
    };

    const res = await fetch(`/api/facilities/${facilityId}/referral-profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; summary?: FacilityReferralProfileSummary; error?: string };
    setSaving(false);
    if (!data.ok || !data.summary) {
      setError("Could not save profile.");
      return;
    }
    onSaved(data.summary);
    if (offerTask && body.next_best_action) {
      await fetch(`/api/facilities/${facilityId}/referral-profile/create-follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: body.next_best_action,
          due_at: body.next_best_action_due_at,
          contact_id: body.best_contact_id,
        }),
      });
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl">
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-bold uppercase text-violet-700">Edit Referral Profile</p>
          <h2 className="text-lg font-semibold text-slate-900">{summary.profile.facility_id ? "Referral source" : "Profile"}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              Relationship status
              <select name="relationship_status" defaultValue={p.relationship_status ?? ""} className={inputCls}>
                <option value="">—</option>
                {FACILITY_RELATIONSHIP_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Referral potential
              <select name="referral_potential" defaultValue={p.referral_potential ?? ""} className={inputCls}>
                <option value="">—</option>
                {FACILITY_PROFILE_REFERRAL_POTENTIALS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Best contact
              <select name="best_contact_id" defaultValue={p.best_contact_id ?? ""} className={inputCls}>
                <option value="">—</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Preferred referral method
              <select name="preferred_referral_method" defaultValue={p.preferred_referral_method ?? ""} className={inputCls}>
                <option value="">—</option>
                {FACILITY_PREFERRED_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Preferred packet method
              <select name="preferred_packet_method" defaultValue={p.preferred_packet_method ?? ""} className={inputCls}>
                <option value="">—</option>
                {FACILITY_PREFERRED_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Preferred contact method
              <select name="preferred_contact_method" defaultValue={p.preferred_contact_method ?? ""} className={inputCls}>
                <option value="">—</option>
                {FACILITY_PREFERRED_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Referral process
              <textarea name="referral_process" defaultValue={p.referral_process ?? ""} rows={3} className={inputCls} />
            </label>
            <label className={labelCls}>Referral fax<input name="referral_fax" defaultValue={p.referral_fax ?? ""} className={inputCls} /></label>
            <label className={labelCls}>Referral email<input name="referral_email" type="email" defaultValue={p.referral_email ?? ""} className={inputCls} /></label>
            <label className={labelCls}>Referral phone<input name="referral_phone" defaultValue={p.referral_phone ?? ""} className={inputCls} /></label>
            <label className={labelCls}>
              Services (comma-separated)
              <input name="services_likely_to_refer" defaultValue={(p.services_likely_to_refer ?? []).join(", ")} className={inputCls} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Payer notes
              <textarea name="payer_notes" defaultValue={p.payer_notes ?? ""} rows={2} className={inputCls} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Objections
              <textarea name="objections" defaultValue={p.objections ?? ""} rows={2} className={inputCls} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Opportunities
              <textarea name="opportunities" defaultValue={p.opportunities ?? ""} rows={2} className={inputCls} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Next best action
              <input name="next_best_action" defaultValue={p.next_best_action ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              Next action due
              <input
                name="next_best_action_due_at"
                type="datetime-local"
                defaultValue={p.next_best_action_due_at ? p.next_best_action_due_at.slice(0, 16) : ""}
                className={inputCls}
              />
            </label>
            <label className={`${labelCls} flex items-center gap-2 pt-6`}>
              <input type="checkbox" checked={offerTask} onChange={(e) => setOfferTask(e.target.checked)} />
              Create follow-up task for next action
            </label>
          </div>
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
          <div className="sticky bottom-0 mt-4 flex gap-2 border-t border-slate-100 bg-white py-4">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-[2] rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
