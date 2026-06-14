"use client";

import { useState } from "react";

import { FacilityCreateFollowUpTaskModal } from "@/app/admin/facilities/_components/FacilityCreateFollowUpTaskModal";
import { FacilityFollowUpTaskList } from "@/app/admin/facilities/_components/FacilityFollowUpTaskList";

type StaffOption = { user_id: string; label: string };

type FacilityFollowUpTasksSectionProps = {
  facilityId: string;
  facilityName: string;
  contacts: { id: string; name: string }[];
  staffOptions?: StaffOption[];
  defaultAssignedTo?: string | null;
};

export function FacilityFollowUpTasksSection({
  facilityId,
  facilityName,
  contacts,
  staffOptions = [],
  defaultAssignedTo,
}: FacilityFollowUpTasksSectionProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
    setRefreshKey((k) => k + 1);
  }

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-6 shadow-sm sm:p-8">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Follow-Up Tasks</h2>
          <p className="mt-1 text-sm text-slate-600">Open tasks and recent completions for this facility.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          Create Follow-Up Task
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Open tasks</h3>
          <div className="mt-2">
            <FacilityFollowUpTaskList
              key={`open-${refreshKey}`}
              tab="all"
              facilityId={facilityId}
              statusesFilter={["open", "snoozed"]}
              limit={20}
              showCancel
              onToast={showToast}
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="text-sm font-semibold text-sky-800 underline"
          >
            {showCompleted ? "Hide completed tasks" : "Show recent completed tasks"}
          </button>
          {showCompleted ? (
            <div className="mt-2">
              <FacilityFollowUpTaskList
                key={`done-${refreshKey}`}
                tab="completed"
                facilityId={facilityId}
                limit={10}
                onToast={showToast}
              />
            </div>
          ) : null}
        </div>
      </div>

      <FacilityCreateFollowUpTaskModal
        open={createOpen}
        facilityId={facilityId}
        facilityName={facilityName}
        contacts={contacts}
        staffOptions={staffOptions}
        defaultAssignedTo={defaultAssignedTo}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setRefreshKey((k) => k + 1)}
        onToast={showToast}
      />
    </section>
  );
}
