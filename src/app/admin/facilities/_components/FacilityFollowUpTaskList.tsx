"use client";

import { useCallback, useEffect, useState } from "react";

import { FacilityFollowUpTaskCard } from "@/app/admin/facilities/_components/FacilityFollowUpTaskCard";
import { FacilityFollowUpTaskModal } from "@/app/admin/facilities/_components/FacilityFollowUpTaskModal";
import type { FollowUpTasksListResponse } from "@/app/api/facilities/follow-up-tasks/route";
import type {
  FollowUpTaskCard,
  FollowUpTaskSummary,
} from "@/lib/crm/facility-follow-up-task-types";
import type { FollowUpTaskActionMode } from "@/lib/crm/facility-follow-up-task-client";

export type FollowUpTaskTab = "overdue" | "today" | "upcoming" | "completed" | "all";

type FacilityFollowUpTaskListProps = {
  tab: FollowUpTaskTab;
  assignedTo?: string | null;
  facilityId?: string | null;
  priorityFilter?: string | null;
  cityFilter?: string | null;
  sourceFilter?: string | null;
  typeFilter?: string | null;
  statusesFilter?: Array<"open" | "completed" | "snoozed" | "canceled">;
  showCancel?: boolean;
  limit?: number;
  onSummary?: (summary: FollowUpTaskSummary) => void;
  onToast?: (message: string) => void;
};

export function FacilityFollowUpTaskList({
  tab,
  assignedTo,
  facilityId,
  priorityFilter,
  cityFilter,
  sourceFilter,
  typeFilter,
  statusesFilter,
  showCancel = false,
  limit = 100,
  onSummary,
  onToast,
}: FacilityFollowUpTaskListProps) {
  const [tasks, setTasks] = useState<FollowUpTaskCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<FollowUpTaskActionMode | null>(null);
  const [activeTask, setActiveTask] = useState<FollowUpTaskCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tab === "completed") {
        params.set("status", "completed");
        params.set("due", "all");
      } else if (tab === "all") {
        params.set("due", "all");
      } else {
        params.set("due", tab);
      }
      if (assignedTo) params.set("assigned_to", assignedTo);
      if (facilityId) params.set("facility_id", facilityId);
      params.set("limit", String(limit));

      const res = await fetch(`/api/facilities/follow-up-tasks?${params.toString()}`);
      const data = (await res.json()) as FollowUpTasksListResponse;
      if (!data.ok) {
        setError("Could not load follow-up tasks.");
        return;
      }

      let filtered = data.tasks;
      if (statusesFilter?.length) {
        filtered = filtered.filter((t) => statusesFilter.includes(t.status));
      }
      if (priorityFilter) filtered = filtered.filter((t) => t.priority === priorityFilter);
      if (cityFilter) filtered = filtered.filter((t) => (t.facility_city ?? "") === cityFilter);
      if (sourceFilter) filtered = filtered.filter((t) => t.source === sourceFilter);
      if (typeFilter) filtered = filtered.filter((t) => (t.facility_type ?? "") === typeFilter);

      setTasks(filtered);
      onSummary?.(data.summary);
    } catch {
      setError("Network error loading tasks.");
    } finally {
      setLoading(false);
    }
  }, [
    tab,
    assignedTo,
    facilityId,
    priorityFilter,
    cityFilter,
    sourceFilter,
    typeFilter,
    statusesFilter,
    limit,
    onSummary,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  function openModal(mode: FollowUpTaskActionMode, task: FollowUpTaskCard) {
    setActiveTask(task);
    setModalMode(mode);
  }

  function handleDone(msg: string) {
    onToast?.(msg);
    void load();
  }

  if (loading) return <p className="text-sm text-slate-500">Loading tasks…</p>;
  if (error) return <p className="text-sm text-rose-700">{error}</p>;
  if (tasks.length === 0) {
    return (
      <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
        No follow-up tasks in this view.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {tasks.map((task) => (
          <FacilityFollowUpTaskCard
            key={task.id}
            task={task}
            showCancel={showCancel}
            onComplete={(t) => openModal("complete", t)}
            onSnooze={(t) => openModal("snooze", t)}
            onReschedule={(t) => openModal("reschedule", t)}
            onCancel={showCancel ? (t) => openModal("cancel", t) : undefined}
            onActionDone={() => void load()}
          />
        ))}
      </div>

      <FacilityFollowUpTaskModal
        open={Boolean(modalMode && activeTask)}
        mode={modalMode ?? "complete"}
        task={activeTask}
        onClose={() => {
          setModalMode(null);
          setActiveTask(null);
        }}
        onDone={handleDone}
      />
    </>
  );
}
