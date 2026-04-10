"use client";

import { useEffect, useState } from "react";

import { upsertFacilityContact } from "@/app/admin/facilities/actions";
import { FACILITY_PREFERRED_CONTACT_OPTIONS } from "@/lib/crm/facility-options";

export type FacilityContactFormValues = {
  id?: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  department: string | null;
  direct_phone: string | null;
  mobile_phone: string | null;
  fax: string | null;
  email: string | null;
  preferred_contact_method: string | null;
  best_time_to_reach: string | null;
  is_decision_maker: boolean;
  influence_level: string | null;
  notes: string | null;
};

const inputCls =
  "mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm";
const labelCls = "flex flex-col gap-0.5 text-[11px] font-medium text-slate-600";
const textareaCls = `${inputCls} min-h-[88px] resize-y`;

type FacilityContactModalProps = {
  facilityId: string;
  initial: FacilityContactFormValues | null;
  open: boolean;
  onClose: () => void;
};

export function FacilityContactModal({ facilityId, initial, open, onClose }: FacilityContactModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  const v = initial;
  const isEdit = Boolean(v?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[min(92vh,840px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">Directory</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{isEdit ? "Edit contact" : "Add contact"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <form action={upsertFacilityContact} className="mt-5 space-y-4">
          <input type="hidden" name="facility_id" value={facilityId} />
          {isEdit && v?.id ? <input type="hidden" name="contact_id" value={v.id} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              First name
              <input name="first_name" defaultValue={v?.first_name ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              Last name
              <input name="last_name" defaultValue={v?.last_name ?? ""} className={inputCls} />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Full name (optional override)
              <input name="full_name" defaultValue={v?.full_name ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              Title
              <input name="title" defaultValue={v?.title ?? ""} className={inputCls} placeholder="e.g. Director of Case Management" />
            </label>
            <label className={labelCls}>
              Department
              <input name="department" defaultValue={v?.department ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              Direct phone
              <input name="direct_phone" type="tel" defaultValue={v?.direct_phone ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              Mobile
              <input name="mobile_phone" type="tel" defaultValue={v?.mobile_phone ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              Fax
              <input name="fax" type="tel" defaultValue={v?.fax ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              Email
              <input name="email" type="email" defaultValue={v?.email ?? ""} className={inputCls} />
            </label>
            <label className={labelCls}>
              Preferred contact method
              <select name="preferred_contact_method" className={inputCls} defaultValue={v?.preferred_contact_method ?? ""}>
                <option value="">—</option>
                {FACILITY_PREFERRED_CONTACT_OPTIONS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Best time to reach
              <input name="best_time_to_reach" defaultValue={v?.best_time_to_reach ?? ""} className={inputCls} />
            </label>
            <label className={`${labelCls} sm:col-span-2 flex-row items-center gap-3`}>
              <span className="sr-only">Decision maker</span>
              <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  name="is_decision_maker"
                  value="1"
                  defaultChecked={v?.is_decision_maker === true}
                  className="rounded border-slate-300"
                />
                Decision maker
              </span>
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Influence level
              <input name="influence_level" defaultValue={v?.influence_level ?? ""} className={inputCls} placeholder="e.g. High / Medium / Low" />
            </label>
            <label className={`${labelCls} sm:col-span-2`}>
              Notes
              <textarea name="notes" defaultValue={v?.notes ?? ""} className={textareaCls} />
            </label>
            {isEdit ? (
              <label className={`${labelCls} sm:col-span-2 flex-row items-center gap-3`}>
                <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" name="deactivate" value="1" className="rounded border-slate-300" />
                  Deactivate this contact
                </span>
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm sm:flex-none"
            >
              {isEdit ? "Save contact" : "Add contact"}
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
