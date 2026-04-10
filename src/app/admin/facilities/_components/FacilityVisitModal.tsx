"use client";

import { useEffect, useState } from "react";

import { createFacilityActivity } from "@/app/admin/facilities/actions";
import { DatetimeLocalField } from "@/app/admin/facilities/_components/DatetimeLocalField";
import {
  FACILITY_ACTIVITY_OUTCOME_OPTIONS,
  FACILITY_ACTIVITY_TYPE_OPTIONS,
} from "@/lib/crm/facility-options";

type ContactOpt = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

const inputCls =
  "mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm";
const labelCls = "flex flex-col gap-0.5 text-[11px] font-medium text-slate-600";
const textareaCls = `${inputCls} min-h-[100px] resize-y`;

function contactLabel(c: ContactOpt): string {
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || "Contact";
}

type FacilityVisitModalProps = {
  facilityId: string;
  contacts: ContactOpt[];
  activityAtDefaultIso: string;
  open: boolean;
  onClose: () => void;
};

export function FacilityVisitModal({ facilityId, contacts, activityAtDefaultIso, open, onClose }: FacilityVisitModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[min(92vh,840px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">Log activity</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Add visit / touch</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <form action={createFacilityActivity} className="mt-5 space-y-4">
          <input type="hidden" name="facility_id" value={facilityId} />

          <label className={labelCls}>
            Contact (optional)
            <select name="facility_contact_id" className={inputCls} defaultValue="">
              <option value="">— None / front desk —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {contactLabel(c)}
                </option>
              ))}
            </select>
          </label>

          <label className={labelCls}>
            Activity type *
            <select name="activity_type" required className={inputCls} defaultValue="">
              <option value="" disabled>
                Select…
              </option>
              {FACILITY_ACTIVITY_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className={labelCls}>
            Outcome
            <select name="outcome" className={inputCls} defaultValue="">
              <option value="">—</option>
              {FACILITY_ACTIVITY_OUTCOME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className={labelCls}>
            When
            <DatetimeLocalField name="activity_at" defaultValueIso={activityAtDefaultIso} className={inputCls} />
          </label>

          <label className={labelCls}>
            Notes
            <textarea name="notes" className={textareaCls} placeholder="Conversation summary, objections, next steps…" />
          </label>

          <label className={labelCls}>
            Next follow-up
            <DatetimeLocalField name="next_follow_up_at" defaultValueIso={null} className={inputCls} />
          </label>

          <label className={labelCls}>
            Follow-up task
            <input name="follow_up_task" className={inputCls} placeholder="e.g. Bring packet, call CM office" />
          </label>

          <label className={labelCls}>
            Referral potential
            <input name="referral_potential" className={inputCls} placeholder="e.g. High — discharge planner engaged" />
          </label>

          <div className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Checklist</p>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" name="materials_dropped_off" value="1" className="rounded border-slate-300" />
              Materials dropped off
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" name="got_business_card" value="1" className="rounded border-slate-300" />
              Got business card
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" name="requested_packet" value="1" className="rounded border-slate-300" />
              Requested packet
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" name="referral_process_captured" value="1" className="rounded border-slate-300" />
              Referral process captured
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm sm:flex-none"
            >
              Save activity
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
