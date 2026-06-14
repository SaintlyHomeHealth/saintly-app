"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { ReferralLeadResponse } from "@/app/api/facilities/[facilityId]/referral-lead/route";
import { FACILITY_REFERRAL_LEAD_STATUSES } from "@/lib/crm/facility-referral-lead-types";
import {
  REFERRAL_SERVICE_OPTIONS,
  type FacilityReferralLeadModalDefaults,
} from "@/lib/crm/facility-referral-lead-client";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { formatLeadPipelineStatusLabel } from "@/lib/crm/lead-pipeline-status";

type StaffOption = { user_id: string; label: string };
type ContactOption = { id: string; name: string };

type FacilityReferralLeadModalProps = {
  open: boolean;
  facilityId: string;
  facilityName: string;
  contacts?: ContactOption[];
  staffOptions?: StaffOption[];
  defaults?: FacilityReferralLeadModalDefaults;
  onClose: () => void;
  onCreated?: (leadId: string) => void;
  onToast?: (message: string) => void;
};

const overlayCls = "fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center";
const panelCls =
  "flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl";
const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200";
const btnPrimary =
  "inline-flex min-h-[2.75rem] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60";
const btnGhost =
  "inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800";

type DuplicateHit = NonNullable<Extract<ReferralLeadResponse, { ok: false }>["possible_duplicates"]>[number];

export function FacilityReferralLeadModal({
  open,
  facilityId,
  facilityName,
  contacts = [],
  staffOptions = [],
  defaults,
  onClose,
  onCreated,
  onToast,
}: FacilityReferralLeadModalProps) {
  const router = useRouter();
  const [referralDate, setReferralDate] = useState(getCrmCalendarTodayIso());
  const [contactId, setContactId] = useState("");
  const [salesRepId, setSalesRepId] = useState("");
  const [status, setStatus] = useState("new");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [payer, setPayer] = useState("");
  const [serviceNeeded, setServiceNeeded] = useState("PT");
  const [notes, setNotes] = useState("");
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateHit[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setReferralDate(getCrmCalendarTodayIso());
    setContactId(defaults?.contactId ?? "");
    setSalesRepId(defaults?.defaultRepId ?? "");
    setStatus("new");
    setFirstName(defaults?.patientFirstName ?? "");
    setLastName(defaults?.patientLastName ?? "");
    setPhone(defaults?.patientPhone ?? "");
    setDob(defaults?.patientDob?.slice(0, 10) ?? "");
    setPayer(defaults?.payer ?? "");
    setServiceNeeded(defaults?.serviceNeeded ?? "PT");
    setNotes(defaults?.defaultNotes ?? "");
    setCreateFollowUp(true);
    setError(null);
    setDuplicates(null);
  }, [open, defaults, facilityId]);

  if (!open) return null;

  async function submit(forceCreate = false) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/${facilityId}/referral-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility_id: facilityId,
          contact_id: contactId || null,
          activity_id: defaults?.activityId ?? null,
          referral_date: referralDate ? `${referralDate}T12:00:00.000Z` : null,
          sales_rep_id: salesRepId || null,
          status,
          patient_first_name: firstName,
          patient_last_name: lastName,
          patient_phone: phone,
          patient_dob: dob || null,
          payer,
          service_needed: serviceNeeded,
          notes,
          create_follow_up_task: createFollowUp,
          force_create: forceCreate,
          attribution: {
            source_type: "facility_outreach",
            source_name: facilityName,
            originating_activity_type: defaults?.originatingActivityType ?? null,
            originating_outcome: defaults?.originatingOutcome ?? null,
          },
        }),
      });

      const data = (await res.json()) as ReferralLeadResponse;

      if (!data.ok) {
        if (data.duplicate_check && data.possible_duplicates?.length) {
          setDuplicates(data.possible_duplicates);
          return;
        }
        setError(
          data.error === "forbidden"
            ? "You do not have permission to create referral leads."
            : data.error === "facility_not_found"
              ? "Facility not found."
              : "Could not create referral lead. Try again."
        );
        return;
      }

      onToast?.("Referral lead created.");
      onCreated?.(data.lead.id);
      onClose();
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (duplicates && duplicates.length > 0) {
    return (
      <div className={overlayCls} role="dialog" aria-modal="true">
        <div className={`${panelCls} p-5`}>
          <h2 className="text-lg font-bold text-slate-900">Possible existing lead found</h2>
          <p className="mt-2 text-sm text-slate-600">
            A lead with similar details may already exist. Review before creating a duplicate.
          </p>
          <ul className="mt-4 space-y-2">
            {duplicates.map((d) => (
              <li key={d.lead_id} className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm">
                <p className="font-semibold text-slate-900">{d.patient_name}</p>
                <p className="text-xs text-slate-600">
                  Status: {formatLeadPipelineStatusLabel(d.status)} · Matched by: {d.matched_by.join(", ")}
                </p>
                <Link
                  href={`/admin/crm/leads/${d.lead_id}`}
                  className="mt-1 inline-block text-xs font-semibold text-sky-700 hover:underline"
                >
                  Open existing lead
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="button" className={`${btnGhost} flex-1`} onClick={() => setDuplicates(null)}>
              Back to form
            </button>
            <button type="button" className={`${btnPrimary} flex-1`} disabled={saving} onClick={() => submit(true)}>
              Create new anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={overlayCls} role="dialog" aria-modal="true">
      <div className={panelCls}>
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">New referral</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">New Referral from {facilityName}</h2>
        </div>

        <form
          className="flex-1 overflow-y-auto px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
        >
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-900">Referral details</legend>
            <div>
              <label className="text-xs font-semibold text-slate-600">Referral date</label>
              <input type="date" className={inputCls} value={referralDate} onChange={(e) => setReferralDate(e.target.value)} />
            </div>
            {contacts.length > 0 ? (
              <div>
                <label className="text-xs font-semibold text-slate-600">Referred by contact</label>
                <select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">— Select contact —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {staffOptions.length > 0 ? (
              <div>
                <label className="text-xs font-semibold text-slate-600">Sales rep / produced by</label>
                <select className={inputCls} value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)}>
                  <option value="">Default (assigned rep)</option>
                  {staffOptions.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label className="text-xs font-semibold text-slate-600">Referral status</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {FACILITY_REFERRAL_LEAD_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset className="mt-6 space-y-4">
            <legend className="text-sm font-semibold text-slate-900">Patient / prospect info</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-600">First name</label>
                <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Last name</label>
                <input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Phone</label>
              <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Date of birth (optional)</label>
              <input type="date" className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Insurance / payer</label>
              <input className={inputCls} value={payer} onChange={(e) => setPayer(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Service needed</label>
              <select className={inputCls} value={serviceNeeded} onChange={(e) => setServiceNeeded(e.target.value)}>
                {REFERRAL_SERVICE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Notes</label>
              <textarea className={`${inputCls} min-h-[4rem]`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </fieldset>

          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
            <p>
              <span className="font-semibold text-slate-800">Source:</span> Facility outreach · {facilityName}
            </p>
            {defaults?.activityId ? (
              <p className="mt-1">
                <span className="font-semibold text-slate-800">Linked activity:</span> Yes
              </p>
            ) : null}
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={createFollowUp} onChange={(e) => setCreateFollowUp(e.target.checked)} />
            Create follow-up task for tomorrow
          </label>

          {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
        </form>

        <div className="shrink-0 flex gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" className={`${btnGhost} flex-1`} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={`${btnPrimary} flex-1`} disabled={saving} onClick={() => submit(false)}>
            {saving ? "Creating…" : "Create Referral Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
