import { createFacility, updateFacility } from "@/app/admin/facilities/actions";
import { DatetimeLocalField } from "@/app/admin/facilities/_components/DatetimeLocalField";
import { FacilityTypeSelect } from "@/app/admin/facilities/_components/FacilityTypeSelect";
import { FACILITY_PRIORITY_OPTIONS, FACILITY_STATUS_OPTIONS } from "@/lib/crm/facility-options";

type StaffOpt = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

export type FacilityRecord = {
  id: string;
  name: string;
  type: string | null;
  status: string;
  priority: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  main_phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  territory: string | null;
  assigned_rep_user_id: string | null;
  referral_method: string | null;
  referral_notes: string | null;
  intake_notes: string | null;
  best_time_to_visit: string | null;
  last_visit_at: string | null;
  next_follow_up_at: string | null;
  is_active: boolean;
  general_notes: string | null;
};

const inputCls =
  "mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm";
const labelCls = "flex flex-col gap-0.5 text-[11px] font-medium text-slate-600";
const textareaCls = `${inputCls} min-h-[88px] resize-y`;

function staffLabel(s: StaffOpt): string {
  const n = (s.full_name ?? "").trim();
  if (n) return n;
  return (s.email ?? "").trim() || s.user_id.slice(0, 8) + "…";
}

type FacilityFormProps = {
  mode: "create" | "edit";
  facility?: FacilityRecord;
  staffOptions: StaffOpt[];
  errorMessage?: string | null;
};

export function FacilityForm({ mode, facility, staffOptions, errorMessage }: FacilityFormProps) {
  const action = mode === "create" ? createFacility : updateFacility;
  const f = facility;

  return (
    <form action={action} className="space-y-8">
      {mode === "edit" && f ? <input type="hidden" name="id" value={f.id} /> : null}

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{errorMessage}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-slate-900">Basics</h2>
        <p className="mt-1 text-sm text-slate-500">Name, classification, and ownership.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className={`${labelCls} sm:col-span-2`}>
            Facility name *
            <input
              name="name"
              required
              defaultValue={f?.name ?? ""}
              className={inputCls}
              placeholder="e.g. Desert Valley Medical Center"
            />
          </label>
          <label className={labelCls}>
            Type
            <FacilityTypeSelect
              name="type"
              defaultValue={f?.type ?? ""}
              emptyLabel="Select type…"
              triggerClassName={inputCls}
            />
          </label>
          <label className={labelCls}>
            Status
            <select name="status" defaultValue={f?.status ?? "New"} className={inputCls}>
              {FACILITY_STATUS_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Priority
            <select name="priority" defaultValue={f?.priority ?? "Medium"} className={inputCls}>
              {FACILITY_PRIORITY_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Assigned rep
            <select name="assigned_rep_user_id" defaultValue={f?.assigned_rep_user_id ?? ""} className={inputCls}>
              <option value="">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {staffLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Territory
            <input name="territory" defaultValue={f?.territory ?? ""} className={inputCls} placeholder="Region / route" />
          </label>
          {mode === "edit" && f ? (
            <label className={labelCls}>
              Record status
              <select name="is_active" defaultValue={f.is_active ? "1" : "0"} className={inputCls}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-slate-900">Location &amp; reachability</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className={`${labelCls} sm:col-span-2`}>
            Address line 1
            <input name="address_line_1" defaultValue={f?.address_line_1 ?? ""} className={inputCls} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>
            Address line 2
            <input name="address_line_2" defaultValue={f?.address_line_2 ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            City
            <input name="city" defaultValue={f?.city ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            State
            <input name="state" defaultValue={f?.state ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            ZIP
            <input name="zip" defaultValue={f?.zip ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            Main phone
            <input name="main_phone" defaultValue={f?.main_phone ?? ""} className={inputCls} type="tel" />
          </label>
          <label className={labelCls}>
            Fax
            <input name="fax" defaultValue={f?.fax ?? ""} className={inputCls} type="tel" />
          </label>
          <label className={labelCls}>
            Email
            <input name="email" defaultValue={f?.email ?? ""} className={inputCls} type="email" />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>
            Website
            <input name="website" defaultValue={f?.website ?? ""} className={inputCls} type="url" placeholder="https://" />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-slate-900">Referral &amp; field notes</h2>
        <div className="mt-6 grid gap-4">
          <label className={labelCls}>
            Referral method
            <input
              name="referral_method"
              defaultValue={f?.referral_method ?? ""}
              className={inputCls}
              placeholder="How referrals are typically sent"
            />
          </label>
          <label className={labelCls}>
            Referral notes
            <textarea name="referral_notes" defaultValue={f?.referral_notes ?? ""} className={textareaCls} />
          </label>
          <label className={labelCls}>
            Intake notes
            <textarea name="intake_notes" defaultValue={f?.intake_notes ?? ""} className={textareaCls} />
          </label>
          <label className={labelCls}>
            Best time to visit
            <input
              name="best_time_to_visit"
              defaultValue={f?.best_time_to_visit ?? ""}
              className={inputCls}
              placeholder="e.g. Tue–Thu mornings"
            />
          </label>
          <label className={labelCls}>
            General notes
            <textarea name="general_notes" defaultValue={f?.general_notes ?? ""} className={textareaCls} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-slate-900">Follow-up</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {mode === "edit" && f ? (
            <label className={labelCls}>
              Last visit (manual override)
              <DatetimeLocalField name="last_visit_at" defaultValueIso={f.last_visit_at} className={inputCls} />
            </label>
          ) : null}
          <label className={labelCls}>
            Next follow-up
            <DatetimeLocalField name="next_follow_up_at" defaultValueIso={f?.next_follow_up_at ?? null} className={inputCls} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Logging a visit with a follow-up date updates this automatically. You can still adjust it here.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md"
        >
          {mode === "create" ? "Create facility" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
