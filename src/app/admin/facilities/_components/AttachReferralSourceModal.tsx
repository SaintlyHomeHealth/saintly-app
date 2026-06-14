"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { FacilityPickerResult } from "@/lib/crm/facility-outreach-types";
import type {
  ReferralSourceReviewItem,
  ReferralSourceReviewMarkReason,
} from "@/lib/crm/facility-referral-source-review-types";
import { REFERRAL_SOURCE_REVIEW_MARK_REASONS } from "@/lib/crm/facility-referral-source-review-types";
import { crmActionBtnMuted, crmActionBtnSky, crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type AttachReferralSourceModalProps = {
  item: ReferralSourceReviewItem;
  onClose: () => void;
  onDone: () => void;
};

type Tab = "attach" | "create" | "mark";

function badgeCls(badge: string) {
  if (badge === "strong") return "bg-emerald-100 text-emerald-900";
  if (badge === "possible") return "bg-amber-100 text-amber-950";
  return "bg-slate-100 text-slate-700";
}

export function AttachReferralSourceModal({ item, onClose, onDone }: AttachReferralSourceModalProps) {
  const [tab, setTab] = useState<Tab>("attach");
  const [facilityQuery, setFacilityQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<FacilityPickerResult[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [createContact, setCreateContact] = useState(Boolean(item.typed_source.referring_contact_name));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const [facName, setFacName] = useState(item.typed_source.referring_office_name ?? "");
  const [facCity, setFacCity] = useState(item.typed_source.office_city ?? "");
  const [facPhone, setFacPhone] = useState(item.typed_source.office_phone ?? item.typed_source.referring_contact_phone ?? "");
  const [facEmail, setFacEmail] = useState(item.typed_source.referring_contact_email ?? "");
  const [contactName, setContactName] = useState(item.typed_source.referring_contact_name ?? "");

  const [markReason, setMarkReason] = useState<ReferralSourceReviewMarkReason>("unknown_source");
  const [markNotes, setMarkNotes] = useState("");

  const searchFacilities = useCallback(async (query: string) => {
    if (!query.trim()) {
      setPickerResults([]);
      return;
    }
    const res = await fetch("/api/facilities/picker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = (await res.json()) as { ok?: boolean; results?: FacilityPickerResult[] };
    setPickerResults(data.results ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void searchFacilities(facilityQuery), 250);
    return () => clearTimeout(t);
  }, [facilityQuery, searchFacilities]);

  const selectedSuggestion = item.suggestions.find((s) => s.facility_id === selectedFacilityId);

  async function submitAttach() {
    if (!selectedFacilityId) {
      setError("Select a facility.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/referral-source-review/${item.lead_id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility_id: selectedFacilityId,
          contact_id: selectedContactId || null,
          create_contact: createContact && !selectedContactId,
          note: note.trim() || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Attach failed.");
        return;
      }
      onDone();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCreate(force = false) {
    if (!facName.trim()) {
      setError("Facility name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setDuplicateWarning(null);
    try {
      const res = await fetch(`/api/facilities/referral-source-review/${item.lead_id}/create-facility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility: {
            name: facName.trim(),
            city: facCity.trim() || null,
            main_phone: facPhone.trim() || null,
            email: facEmail.trim() || null,
          },
          contact: contactName.trim()
            ? { name: contactName.trim(), phone: facPhone.trim() || null, email: facEmail.trim() || null }
            : null,
          note: note.trim() || null,
          skip_duplicate_check: force,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        duplicate_warning?: string;
      };
      if (res.status === 409 && data.duplicate_warning) {
        setDuplicateWarning(data.duplicate_warning);
        setError(data.error ?? "possible_duplicate");
        return;
      }
      if (!data.ok) {
        setError(data.error ?? "Create failed.");
        return;
      }
      onDone();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function submitMarkReviewed() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/referral-source-review/${item.lead_id}/mark-reviewed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: markReason, notes: markNotes.trim() || null }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      onDone();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Review referral source</h2>
            <p className="text-sm text-slate-600">
              {item.patient_name} · {item.typed_source.referring_office_name ?? "Unknown office"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["attach", "Attach facility"],
              ["create", "Create facility"],
              ["mark", "No facility"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={tabCls(tab === key)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "attach" ? (
          <div className="mt-4 space-y-3">
            {item.suggestions.length > 0 ? (
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Suggested matches</p>
                <div className="mt-2 space-y-2">
                  {item.suggestions.map((s) => (
                    <label
                      key={s.facility_id}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${selectedFacilityId === s.facility_id ? "border-sky-400 bg-sky-50" : "border-slate-200"}`}
                    >
                      <input
                        type="radio"
                        name="suggested-facility"
                        checked={selectedFacilityId === s.facility_id}
                        onChange={() => {
                          setSelectedFacilityId(s.facility_id);
                          setSelectedContactId(s.contacts[0]?.id ?? "");
                        }}
                      />
                      <span className="flex-1 text-sm">
                        <span className="font-semibold">{s.facility_name}</span>
                        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeCls(s.match_badge)}`}>
                          {Math.round(s.match_confidence * 100)}%
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-600">{s.match_reasons.join(" · ")}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="block text-xs font-semibold uppercase text-slate-500">
              Search facility
              <input
                value={facilityQuery}
                onChange={(e) => setFacilityQuery(e.target.value)}
                className={`${crmFilterInputCls} mt-1 w-full`}
                placeholder="Office name, city, phone…"
              />
            </label>
            {pickerResults.length > 0 ? (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {pickerResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`block w-full rounded px-2 py-1.5 text-left text-sm ${selectedFacilityId === r.id ? "bg-sky-100" : "hover:bg-slate-50"}`}
                    onClick={() => setSelectedFacilityId(r.id)}
                  >
                    {r.name}
                    <span className="ml-1 text-xs text-slate-500">{r.city ?? ""}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {selectedSuggestion && selectedSuggestion.contacts.length > 0 ? (
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Contact (optional)
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className={`${crmFilterInputCls} mt-1 w-full`}
                >
                  <option value="">— Select contact —</option>
                  {selectedSuggestion.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.role ? ` (${c.role})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {!selectedContactId && item.typed_source.referring_contact_name ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={createContact} onChange={(e) => setCreateContact(e.target.checked)} />
                Create contact from typed info ({item.typed_source.referring_contact_name})
              </label>
            ) : null}

            <label className="block text-xs font-semibold uppercase text-slate-500">
              Note (optional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${crmFilterInputCls} mt-1 w-full`} />
            </label>

            <button type="button" disabled={saving} onClick={() => void submitAttach()} className={crmActionBtnSky}>
              {saving ? "Saving…" : "Attach Source"}
            </button>
          </div>
        ) : null}

        {tab === "create" ? (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Facility name
              <input value={facName} onChange={(e) => setFacName(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase text-slate-500">
                City
                <input value={facCity} onChange={(e) => setFacCity(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
              </label>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Phone
                <input value={facPhone} onChange={(e) => setFacPhone(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
              </label>
            </div>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Contact name
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
            </label>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Email
              <input value={facEmail} onChange={(e) => setFacEmail(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
            </label>
            {duplicateWarning ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {duplicateWarning}
                <button
                  type="button"
                  className="ml-2 font-semibold underline"
                  onClick={() => void submitCreate(true)}
                >
                  Create anyway
                </button>
              </div>
            ) : null}
            <button type="button" disabled={saving} onClick={() => void submitCreate()} className={crmActionBtnSky}>
              {saving ? "Creating…" : "Create & Attach"}
            </button>
          </div>
        ) : null}

        {tab === "mark" ? (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Reason
              <select
                value={markReason}
                onChange={(e) => setMarkReason(e.target.value as ReferralSourceReviewMarkReason)}
                className={`${crmFilterInputCls} mt-1 w-full`}
              >
                {REFERRAL_SOURCE_REVIEW_MARK_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Notes
              <textarea value={markNotes} onChange={(e) => setMarkNotes(e.target.value)} rows={3} className={`${crmFilterInputCls} mt-1 w-full`} />
            </label>
            <button type="button" disabled={saving} onClick={() => void submitMarkReviewed()} className={crmActionBtnMuted}>
              {saving ? "Saving…" : "Mark Reviewed / No Facility"}
            </button>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        <p className="mt-4 text-xs text-slate-500">
          <Link href={`/admin/crm/leads/${item.lead_id}`} className="text-sky-800 hover:underline">
            Open lead in CRM
          </Link>
        </p>
      </div>
    </div>
  );
}

function tabCls(active: boolean) {
  return `rounded-lg border px-3 py-1.5 text-xs font-semibold ${
    active ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-700"
  }`;
}
