"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FacilityFollowUpTaskCard } from "@/app/admin/facilities/_components/FacilityFollowUpTaskCard";
import { FacilityFollowUpTaskModal } from "@/app/admin/facilities/_components/FacilityFollowUpTaskModal";
import type { FollowUpTasksListResponse } from "@/app/api/facilities/follow-up-tasks/route";
import type {
  FollowUpTaskCard,
  FollowUpTaskSummary,
} from "@/lib/crm/facility-follow-up-task-types";
import type { FollowUpTaskActionMode } from "@/lib/crm/facility-follow-up-task-client";

type FacilityOutreachFollowUpTasksProps = {
  onSummary?: (summary: FollowUpTaskSummary) => void;
  onToast?: (message: string) => void;
};

export function FacilityOutreachFollowUpTasks({
  onSummary,
  onToast,
}: FacilityOutreachFollowUpTasksProps) {
  const [tasks, setTasks] = useState<FollowUpTaskCard[]>([]);
  const [summary, setSummary] = useState<FollowUpTaskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<FollowUpTaskActionMode | null>(null);
  const [activeTask, setActiveTask] = useState<FollowUpTaskCard | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overdueRes, todayRes, summaryRes] = await Promise.all([
        fetch("/api/facilities/follow-up-tasks?due=overdue&limit=5"),
        fetch("/api/facilities/follow-up-tasks?due=today&limit=5"),
        fetch("/api/facilities/follow-up-tasks?due=all&limit=1"),
      ]);
      const overdueData = (await overdueRes.json()) as FollowUpTasksListResponse;
      const todayData = (await todayRes.json()) as FollowUpTasksListResponse;
      const summaryData = (await summaryRes.json()) as FollowUpTasksListResponse;

      const merged: FollowUpTaskCard[] = [];
      const seen = new Set<string>();
      if (overdueData.ok) {
        for (const t of overdueData.tasks) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            merged.push(t);
          }
        }
      }
      if (todayData.ok) {
        for (const t of todayData.tasks) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            merged.push(t);
          }
        }
      }
      setTasks(merged.slice(0, 5));
      if (summaryData.ok) {
        setSummary(summaryData.summary);
        onSummary?.(summaryData.summary);
      }
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [onSummary]);

  useEffect(() => {
    void load();
  }, [load]);

  function openModal(mode: FollowUpTaskActionMode, task: FollowUpTaskCard) {
    setActiveTask(task);
    setModalMode(mode);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Follow-Up Tasks
          </h2>
          {summary ? (
            <p className="mt-0.5 text-xs text-slate-600">
              {summary.overdue} overdue · {summary.due_today} due today
            </p>
          ) : null}
        </div>
        <Link
          href="/admin/facilities/follow-ups"
          className="text-xs font-semibold text-sky-800 underline"
        >
          View all follow-ups
        </Link>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading tasks…</p> : null}
      {!loading && tasks.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          No follow-up tasks due today or overdue.
        </p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <FacilityFollowUpTaskCard
              key={task.id}
              task={task}
              compact
              onComplete={(t) => openModal("complete", t)}
              onSnooze={(t) => openModal("snooze", t)}
              onActionDone={() => void load()}
            />
          ))}
        </div>
      )}

      <FacilityFollowUpTaskModal
        open={Boolean(modalMode && activeTask)}
        mode={modalMode ?? "complete"}
        task={activeTask}
        onClose={() => {
          setModalMode(null);
          setActiveTask(null);
        }}
        onDone={(msg) => {
          onToast?.(msg);
          void load();
        }}
      />
    </section>
  );
}
