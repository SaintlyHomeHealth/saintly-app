"use client";

import { updateFacilityFollowUpOnly } from "@/app/admin/facilities/actions";
import { DatetimeLocalField } from "@/app/admin/facilities/_components/DatetimeLocalField";

const inputCls =
  "mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm";
const labelCls = "flex flex-col gap-0.5 text-[11px] font-medium text-slate-600";

type FacilityFollowUpFormProps = {
  facilityId: string;
  nextFollowUpIso: string | null;
  bestTimeToVisit: string | null;
};

export function FacilityFollowUpForm({ facilityId, nextFollowUpIso, bestTimeToVisit }: FacilityFollowUpFormProps) {
  return (
    <form action={updateFacilityFollowUpOnly} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={facilityId} />
      <label className={labelCls}>
        Next follow-up
        <DatetimeLocalField name="next_follow_up_at" defaultValueIso={nextFollowUpIso} className={inputCls} />
      </label>
      <label className={labelCls}>
        Best time to visit
        <input
          name="best_time_to_visit"
          defaultValue={bestTimeToVisit ?? ""}
          className={inputCls}
          placeholder="e.g. Mornings before 11"
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
        >
          Save follow-up
        </button>
      </div>
    </form>
  );
}
