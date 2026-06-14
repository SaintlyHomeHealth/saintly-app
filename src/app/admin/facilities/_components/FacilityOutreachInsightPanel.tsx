import { formatFacilityDate } from "@/lib/crm/facility-address";
import type { FacilityOutreachInsight } from "@/lib/crm/facility-analytics-types";

type FacilityOutreachInsightPanelProps = {
  insight: FacilityOutreachInsight;
};

export function FacilityOutreachInsightPanel({ insight }: FacilityOutreachInsightPanelProps) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <h3 className="text-sm font-bold text-slate-900">Facility Outreach Summary</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-medium uppercase text-slate-500">Total activities</dt>
          <dd className="font-semibold text-slate-900">{insight.totalActivities}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase text-slate-500">Last visit</dt>
          <dd className="font-semibold text-slate-900">
            {insight.lastVisitAt ? formatFacilityDate(insight.lastVisitAt) : "Never"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase text-slate-500">Open follow-ups</dt>
          <dd className="font-semibold text-slate-900">{insight.openFollowUpTasks}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase text-slate-500">Photos</dt>
          <dd className="font-semibold text-slate-900">{insight.photosUploaded}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase text-slate-500">Contacts</dt>
          <dd className="font-semibold text-slate-900">{insight.contactsCount}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase text-slate-500">Referral potential</dt>
          <dd className="font-semibold text-slate-900">{insight.referralPotential ?? "—"}</dd>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <dt className="text-[11px] font-medium uppercase text-slate-500">Last outcome</dt>
          <dd className="font-semibold text-slate-900">{insight.lastOutcome ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
