"use client";

import { useState } from "react";

import type { DiscoverExternalResult } from "@/app/api/facilities/discover/route";
import type { QuickAddFromPlaceResponse } from "@/app/api/facilities/quick-add-from-place/route";
import { FACILITY_TYPE_OPTIONS } from "@/lib/crm/facility-options";

export type QuickAddDraft = {
  google_place_id: string;
  name: string;
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
  formatted_address: string;
  main_phone: string;
  website: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
};

type DiscoverQuickAddModalProps = {
  draft: QuickAddDraft;
  onClose: () => void;
  onSaved: (facilityId: string, name: string) => void;
  onUseExisting: (facilityId: string) => void;
};

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200";

export function DiscoverQuickAddModal({
  draft,
  onClose,
  onSaved,
  onUseExisting,
}: DiscoverQuickAddModalProps) {
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<
    NonNullable<Extract<QuickAddFromPlaceResponse, { ok: false }>["duplicates"]>
  >([]);

  async function save(createAnyway = false) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/facilities/quick-add-from-place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          address_line_1: form.address_line_1.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          zip: form.zip.trim() || null,
          main_phone: form.main_phone.trim() || null,
          website: form.website.trim() || null,
          type: form.type.trim() || null,
          latitude: form.latitude,
          longitude: form.longitude,
          google_place_id: form.google_place_id.trim() || null,
          notes: form.notes.trim() || null,
          create_anyway: createAnyway,
        }),
      });
      const data = (await res.json()) as QuickAddFromPlaceResponse;
      if (data.ok) {
        onSaved(data.facility_id, data.name);
        return;
      }
      if (data.error === "possible_duplicate" && data.duplicates?.length) {
        setDuplicates(data.duplicates);
        return;
      }
      setError(
        data.error === "duplicate_google_place_id"
          ? "This Google place is already in the portal."
          : data.error === "save_failed"
            ? "Could not save facility. Try again."
            : data.error ?? "Save failed"
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
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl"
        role="dialog"
        aria-labelledby="quick-add-title"
      >
        <div className="sticky top-0 border-b border-slate-100 bg-white px-5 py-4">
          <h2 id="quick-add-title" className="text-lg font-semibold text-slate-900">
            Quick Add Facility
          </h2>
          <p className="mt-1 text-xs text-slate-500">Review and edit before saving to the portal.</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {duplicates.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">Possible match found</p>
              <p className="mt-1 text-xs text-amber-900">Use the existing facility or create a new record anyway.</p>
              <ul className="mt-3 space-y-2">
                {duplicates.map((d) => (
                  <li key={d.id} className="rounded-lg border border-amber-100 bg-white p-3 text-xs">
                    <p className="font-semibold text-slate-900">{d.name}</p>
                    <p className="text-slate-600">{d.address}</p>
                    <p className="mt-1 text-slate-500">{d.match_reason}</p>
                    <button
                      type="button"
                      onClick={() => onUseExisting(d.id)}
                      className="mt-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-900"
                    >
                      Use Existing Facility
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(true)}
                  className="rounded-xl border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-950"
                >
                  Create New Anyway
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicates([])}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  Back to edit
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="block text-xs font-medium text-slate-600">
                Facility name
                <input
                  className={`${inputCls} mt-1`}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Address
                <input
                  className={`${inputCls} mt-1`}
                  value={form.address_line_1}
                  onChange={(e) => setForm((f) => ({ ...f, address_line_1: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-xs font-medium text-slate-600">
                  City
                  <input
                    className={`${inputCls} mt-1`}
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  State
                  <input
                    className={`${inputCls} mt-1`}
                    value={form.state}
                    onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  ZIP
                  <input
                    className={`${inputCls} mt-1`}
                    value={form.zip}
                    onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-600">
                Phone
                <input
                  className={`${inputCls} mt-1`}
                  value={form.main_phone}
                  onChange={(e) => setForm((f) => ({ ...f, main_phone: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Website
                <input
                  className={`${inputCls} mt-1`}
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Type / specialty
                <select
                  className={`${inputCls} mt-1`}
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  <option value="">Select type…</option>
                  {FACILITY_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Notes
                <textarea
                  className={`${inputCls} mt-1 min-h-[4rem]`}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional import notes"
                />
              </label>
              <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600">
                <p>
                  <span className="font-medium">Google place ID:</span> {form.google_place_id || "—"}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Source:</span> Google Places
                </p>
              </div>
            </>
          )}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}
        </div>

        {duplicates.length === 0 ? (
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
              disabled={saving || !form.name.trim()}
              onClick={() => void save(false)}
              className="flex-1 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Facility"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function externalResultToQuickAddDraft(r: DiscoverExternalResult): QuickAddDraft {
  return {
    google_place_id: r.google_place_id,
    name: r.name,
    address_line_1: r.address_line_1,
    city: r.city,
    state: r.state,
    zip: r.zip,
    formatted_address: r.formatted_address,
    main_phone: r.phone ?? "",
    website: r.website ?? "",
    type: r.type ?? "",
    latitude: r.latitude,
    longitude: r.longitude,
    notes: "",
  };
}

/** Shared Quick Add modal — used by Discovery and Route Builder. */
export { DiscoverQuickAddModal as FacilityQuickAddModal };

export function routeStopToQuickAddDraft(
  stop: import("@/lib/crm/facility-route-draft").FacilityRouteDraftStop
): QuickAddDraft | null {
  if (stop.facilityId && stop.portalStatus === "already_in_portal") return null;
  if (!stop.googlePlaceId && !stop.address) return null;

  const formatted =
    stop.address?.trim() ||
    [stop.address_line_1, stop.city, [stop.state, stop.zip].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");

  return {
    google_place_id: stop.googlePlaceId ?? "",
    name: stop.name,
    address_line_1: stop.address_line_1 ?? formatted.split(",")[0]?.trim() ?? "",
    city: stop.city ?? "",
    state: stop.state ?? "",
    zip: stop.zip ?? "",
    formatted_address: formatted,
    main_phone: stop.phone ?? "",
    website: stop.website ?? "",
    type: stop.type ?? "",
    latitude: stop.latitude ?? null,
    longitude: stop.longitude ?? null,
    notes: stop.notes ?? "",
  };
}
