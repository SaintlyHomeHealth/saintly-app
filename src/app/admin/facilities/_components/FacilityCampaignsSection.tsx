"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FacilityEnrollCampaignModal } from "@/app/admin/facilities/_components/FacilityEnrollCampaignModal";
import type { FacilityEnrollmentSummary } from "@/lib/crm/facility-playbook-types";
import { FacilityQuickLogButton } from "@/app/admin/facilities/_components/FacilityQuickLogButton";
import { formatFacilityDate } from "@/lib/crm/facility-address";

type FacilityCampaignsSectionProps = {
  facilityId: string;
  facilityName: string;
  canManage: boolean;
};

export function FacilityCampaignsSection({
  facilityId,
  facilityName,
  canManage,
}: FacilityCampaignsSectionProps) {
  const [enrollments, setEnrollments] = useState<FacilityEnrollmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollOpen, setEnrollOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/facilities/campaigns/enrollments?facility_id=${facilityId}`);
        const data = (await res.json()) as { ok: boolean; enrollments?: FacilityEnrollmentSummary[] };
        if (data.ok) setEnrollments(data.enrollments ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [facilityId]);

  function reload() {
    void fetch(`/api/facilities/campaigns/enrollments?facility_id=${facilityId}`)
      .then((r) => r.json())
      .then((data: { ok: boolean; enrollments?: FacilityEnrollmentSummary[] }) => {
        if (data.ok) setEnrollments(data.enrollments ?? []);
      });
  }

  return (
    <section className="rounded-2xl border border-pink-200 bg-pink-50/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-pink-900">Campaigns</h2>
        {canManage ? (
          <button
            type="button"
            onClick={() => setEnrollOpen(true)}
            className="rounded-lg border border-pink-600 bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700"
          >
            Enroll in Campaign
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-2 text-sm text-slate-600">Loading…</p>
      ) : enrollments.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No active campaign enrollments.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {enrollments.map((e) => (
            <li key={e.enrollment_id} className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/admin/facilities/campaigns/${e.campaign_id}`} className="font-semibold text-pink-950 hover:underline">
                    {e.campaign_name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-600">
                    Step {e.current_step_number} of {e.total_steps}
                    {e.current_step_title ? `: ${e.current_step_title}` : ""} · {e.progress_pct}% · {e.status}
                  </p>
                  {e.next_due_at ? (
                    <p className="text-xs text-slate-500">Next due {formatFacilityDate(e.next_due_at)}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/facilities/campaigns/${e.campaign_id}`}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Open
                  </Link>
                  {e.next_task_id ? (
                    <FacilityQuickLogButton
                      facilityId={facilityId}
                      facilityName={facilityName}
                      className="rounded-lg border border-sky-600 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900"
                    >
                      Quick Log Step
                    </FacilityQuickLogButton>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <FacilityEnrollCampaignModal
          open={enrollOpen}
          onClose={() => setEnrollOpen(false)}
          facilityId={facilityId}
          facilityName={facilityName}
          onEnrolled={() => reload()}
        />
      ) : null}
    </section>
  );
}
