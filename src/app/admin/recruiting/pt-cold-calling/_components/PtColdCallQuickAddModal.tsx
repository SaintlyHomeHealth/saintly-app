"use client";

import { useState } from "react";

import type { QuickAddColdCallResponse } from "@/app/api/recruiting/pt-cold-calling/quick-add/route";
import {
  PT_COLD_CALL_OUTCOMES,
  PT_COLD_CALL_STATUSES,
} from "@/lib/recruiting/pt-cold-call-options";
import type { PtColdCallSearchResult } from "@/lib/recruiting/pt-cold-call-types";
import { inputCls, formatShortDate, ymdToFollowUpIso } from "./pt-cold-call-shared";

export type QuickAddDraft = {
  google_place_id: string;
  clinic_name: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  latitude: number | null;
  longitude: number | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_maps_url: string;
};

export function searchResultToQuickAddDraft(r: PtColdCallSearchResult): QuickAddDraft {
  return {
    google_place_id: r.google_place_id,
    clinic_name: r.clinic_name,
    phone: r.phone ?? "",
    website: r.website ?? "",
    address: r.address_line_1,
    city: r.city,
    state: r.state,
    zip_code: r.zip,
    latitude: r.latitude,
    longitude: r.longitude,
    google_rating: r.google_rating,
    google_review_count: r.google_review_count,
    google_maps_url: r.google_maps_url,
  };
}

type Props = {
  draft: QuickAddDraft;
  onClose: () => void;
  onSaved: (targetId: string, clinicName: string) => void;
  onOpenExisting: (targetId: string) => void;
};

type Duplicate = NonNullable<Extract<QuickAddColdCallResponse, { ok: false }>["duplicate"]>;

export function PtColdCallQuickAddModal({ draft, onClose, onSaved, onOpenExisting }: Props) {
  const [clinic, setClinic] = useState(draft);
  const [status, setStatus] = useState<string>("New");
  const [person, setPerson] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);

  async function save(createAnyway = false) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiting/pt-cold-calling/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinic_name: clinic.clinic_name.trim(),
          google_place_id: clinic.google_place_id.trim() || null,
          phone: clinic.phone.trim() || null,
          website: clinic.website.trim() || null,
          address: clinic.address.trim() || null,
          city: clinic.city.trim() || null,
          state: clinic.state.trim() || null,
          zip_code: clinic.zip_code.trim() || null,
          latitude: clinic.latitude,
          longitude: clinic.longitude,
          google_rating: clinic.google_rating,
          google_review_count: clinic.google_review_count,
          google_maps_url: clinic.google_maps_url || null,
          status,
          contact_person: person.trim() || null,
          contact_title: title.trim() || null,
          notes: notes.trim() || null,
          call_outcome: outcome.trim() || null,
          next_follow_up_at: followUp ? ymdToFollowUpIso(followUp) : null,
          follow_up_reason: followUpReason.trim() || null,
          do_not_call: status === "Do Not Call",
          create_anyway: createAnyway,
        }),
      });
      const data = (await res.json()) as QuickAddColdCallResponse;
      if (data.ok) {
        onSaved(data.target_id, data.clinic_name);
        return;
      }
      if (data.error === "possible_duplicate" && data.duplicate) {
        setDuplicate(data.duplicate);
        return;
      }
      setError(
        data.error === "duplicate_google_place_id"
          ? "This clinic is already in PT Cold Calling."
          : data.error === "missing_name"
            ? "Enter a clinic name."
            : data.error === "save_failed"
              ? "Could not save. Try again."
              : data.error ?? "Save failed."
      );
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div
        className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl"
        role="dialog"
        aria-labelledby="pt-quick-add-title"
      >
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4">
          <h2 id="pt-quick-add-title" className="text-lg font-semibold text-slate-900">
            Quick Add — PT/PTA Call Target
          </h2>
          <p className="mt-1 text-xs text-slate-500">Log who you spoke with and your next step while you&apos;re on the call.</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {duplicate ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">Already in PT Cold Calling</p>
              <p className="mt-1 text-xs text-amber-900">{duplicate.match_reason}</p>
              <div className="mt-3 rounded-lg border border-amber-100 bg-white p-3 text-xs">
                <p className="font-semibold text-slate-900">{duplicate.clinic_name}</p>
                {duplicate.city ? <p className="text-slate-600">{duplicate.city}</p> : null}
                <dl className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                  <div>
                    <dt className="font-semibold text-slate-500">Status</dt>
                    <dd>{duplicate.status ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Last called</dt>
                    <dd>{formatShortDate(duplicate.last_called_at)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">Next follow-up</dt>
                    <dd>{formatShortDate(duplicate.next_follow_up_at)}</dd>
                  </div>
                </dl>
                {duplicate.latest_note ? (
                  <p className="mt-2 border-t border-slate-100 pt-2 text-slate-600">
                    <span className="font-semibold text-slate-500">Latest note: </span>
                    {duplicate.latest_note}
                  </p>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenExisting(duplicate.id)}
                  className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900"
                >
                  Open existing & add note
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(true)}
                  className="rounded-xl border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-950 disabled:opacity-50"
                >
                  Add anyway
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicate(null)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="block text-xs font-medium text-slate-600">
                Clinic name
                <input
                  className={`${inputCls} mt-1`}
                  value={clinic.clinic_name}
                  onChange={(e) => setClinic((c) => ({ ...c, clinic_name: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-600">
                  Phone
                  <input
                    className={`${inputCls} mt-1`}
                    value={clinic.phone}
                    onChange={(e) => setClinic((c) => ({ ...c, phone: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Website
                  <input
                    className={`${inputCls} mt-1`}
                    value={clinic.website}
                    onChange={(e) => setClinic((c) => ({ ...c, website: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-6 gap-2">
                <label className="col-span-3 block text-xs font-medium text-slate-600">
                  City
                  <input
                    className={`${inputCls} mt-1`}
                    value={clinic.city}
                    onChange={(e) => setClinic((c) => ({ ...c, city: e.target.value }))}
                  />
                </label>
                <label className="col-span-1 block text-xs font-medium text-slate-600">
                  ST
                  <input
                    className={`${inputCls} mt-1`}
                    value={clinic.state}
                    onChange={(e) => setClinic((c) => ({ ...c, state: e.target.value }))}
                  />
                </label>
                <label className="col-span-2 block text-xs font-medium text-slate-600">
                  ZIP
                  <input
                    className={`${inputCls} mt-1`}
                    value={clinic.zip_code}
                    onChange={(e) => setClinic((c) => ({ ...c, zip_code: e.target.value }))}
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-sky-800">This call</p>
                <label className="mt-2 block text-xs font-medium text-slate-600">
                  Status
                  <select className={`${inputCls} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
                    {PT_COLD_CALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-slate-600">
                    Spoke with
                    <input
                      className={`${inputCls} mt-1`}
                      value={person}
                      onChange={(e) => setPerson(e.target.value)}
                      placeholder="Name"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Title / role
                    <input
                      className={`${inputCls} mt-1`}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Front desk, PT, owner…"
                    />
                  </label>
                </div>
                <label className="mt-2 block text-xs font-medium text-slate-600">
                  Call outcome
                  <select className={`${inputCls} mt-1`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    <option value="">No outcome yet</option>
                    {PT_COLD_CALL_OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-2 block text-xs font-medium text-slate-600">
                  Notes
                  <textarea
                    className={`${inputCls} mt-1 min-h-[3.5rem]`}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="What was said, who to ask for next time…"
                  />
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-slate-600">
                    Follow-up date
                    <input
                      type="date"
                      className={`${inputCls} mt-1`}
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-600">
                    Follow-up reason
                    <input
                      className={`${inputCls} mt-1`}
                      value={followUpReason}
                      onChange={(e) => setFollowUpReason(e.target.value)}
                      placeholder="Call back manager…"
                    />
                  </label>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Saves as a recruiting/employment call target (pipeline: PT Cold Calling). Not a patient lead or referral
                source.
              </p>
            </>
          )}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          ) : null}
        </div>

        {duplicate ? null : (
          <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !clinic.clinic_name.trim()}
              onClick={() => void save(false)}
              className="flex-[2] rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Call Target"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
