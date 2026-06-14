"use client";

import { useState } from "react";

import { FacilityAlertBanner } from "@/app/admin/facilities/_components/FacilityAlertBanner";
import { FacilityFollowUpTaskList } from "@/app/admin/facilities/_components/FacilityFollowUpTaskList";
import { useFacilityNotifications } from "@/app/admin/facilities/_components/useFacilityNotifications";
import type { FollowUpTaskTab } from "@/app/admin/facilities/_components/FacilityFollowUpTaskList";
import type { FollowUpTaskSummary } from "@/lib/crm/facility-follow-up-task-types";
import { FOLLOW_UP_TASK_SOURCES, FOLLOW_UP_SOURCE_LABELS } from "@/lib/crm/facility-follow-up-task-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type StaffOption = { user_id: string; label: string };

type FacilityFollowUpsViewProps = {
  currentUserId: string;
  canFilterReps: boolean;
  staffOptions: StaffOption[];
  cityOptions: string[];
  typeOptions: string[];
};

const tabs: { id: FollowUpTaskTab; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Due Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

export function FacilityFollowUpsView({
  currentUserId,
  canFilterReps,
  staffOptions,
  cityOptions,
  typeOptions,
}: FacilityFollowUpsViewProps) {
  const [tab, setTab] = useState<FollowUpTaskTab>("overdue");
  const [assignedFilter, setAssignedFilter] = useState(canFilterReps ? "" : currentUserId);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [summary, setSummary] = useState<FollowUpTaskSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [listKey, setListKey] = useState(0);

  const { notifications } = useFacilityNotifications();

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
    setListKey((k) => k + 1);
  }

  return (
    <div className="space-y-5">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <FacilityAlertBanner
        title="Follow-up alerts"
        items={[
          ...(summary && summary.overdue > 0
            ? [
                {
                  key: "overdue_count",
                  title: `${summary.overdue} overdue follow-up${summary.overdue === 1 ? "" : "s"}`,
                  message: "Prioritize overdue tasks before new outreach.",
                  severity: summary.overdue >= 3 ? ("urgent" as const) : ("warning" as const),
                  actionUrl: "/admin/facilities/follow-ups",
                  actionLabel: "Review overdue",
                },
              ]
            : []),
          ...notifications
            .filter((n) =>
              ["facility_follow_up_due", "facility_follow_up_overdue", "facility_task_assigned"].includes(
                n.notification_type
              )
            )
            .slice(0, 3)
            .map((n) => ({
              key: n.id,
              title: n.title,
              message: n.message ?? undefined,
              severity: n.severity,
              actionUrl: n.action_url ?? undefined,
            })),
        ]}
      />

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Overdue", value: summary?.overdue ?? "—" },
          { label: "Due today", value: summary?.due_today ?? "—" },
          { label: "Upcoming", value: summary?.upcoming ?? "—" },
          { label: "Completed this week", value: summary?.completed_this_week ?? "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.id
                ? "border-sky-600 bg-sky-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-sky-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        {canFilterReps ? (
          <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Assigned to
            <select
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value)}
              className={`${crmFilterInputCls} min-w-[10rem]`}
            >
              <option value="">All reps</option>
              <option value={currentUserId}>Assigned to me</option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="self-center text-xs font-medium text-slate-600">Showing your tasks</p>
        )}

        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Priority
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className={`${crmFilterInputCls} min-w-[8rem]`}
          >
            <option value="">All</option>
            <option value="High">High</option>
            <option value="Normal">Normal</option>
            <option value="Low">Low</option>
          </select>
        </label>

        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          City
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className={`${crmFilterInputCls} min-w-[8rem]`}
          >
            <option value="">All</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Facility type
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`${crmFilterInputCls} min-w-[8rem]`}
          >
            <option value="">All</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Source
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className={`${crmFilterInputCls} min-w-[8rem]`}
          >
            <option value="">All</option>
            {FOLLOW_UP_TASK_SOURCES.map((s) => (
              <option key={s} value={s}>
                {FOLLOW_UP_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <FacilityFollowUpTaskList
        key={`${listKey}-${tab}-${assignedFilter}-${priorityFilter}-${cityFilter}-${sourceFilter}-${typeFilter}`}
        tab={tab}
        assignedTo={assignedFilter || null}
        priorityFilter={priorityFilter || null}
        cityFilter={cityFilter || null}
        sourceFilter={sourceFilter || null}
        typeFilter={typeFilter || null}
        showCancel
        onSummary={setSummary}
        onToast={showToast}
      />
    </div>
  );
}
