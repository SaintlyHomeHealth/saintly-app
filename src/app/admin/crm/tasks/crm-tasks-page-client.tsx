"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import type { AssignableLeadOwnerRow } from "@/lib/crm/assignable-lead-owners";
import type { CrmTaskListTab, CrmTaskPriority, CrmTaskRow } from "@/lib/crm/crm-task-types";
import { formatAppDateTime, parseAppDateTimeInputToUtcIso } from "@/lib/datetime/app-timezone";
import {
  cancelCrmTaskAction,
  completeCrmTaskAction,
  createCrmTaskAction,
  reopenCrmTaskAction,
  updateCrmTaskAction,
} from "@/app/admin/crm/tasks/actions";

import { AiVoiceTaskButton } from "@/components/admin/crm/AiVoiceTaskButton";
import { SaintlyRealtimeAssistant } from "@/components/admin/crm/SaintlyRealtimeAssistant";
import type { SaintlyRealtimeGatewayClientSnapshot } from "@/lib/crm/saintly-ai-voice-config";

function staffPickLabel(s: AssignableLeadOwnerRow): string {
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  const em = (s.email ?? "").trim();
  if (em) return em;
  return `${s.user_id.slice(0, 8)}…`;
}

function priorityBadge(p: CrmTaskPriority): string {
  switch (p) {
    case "urgent":
      return "bg-rose-100 text-rose-900 ring-rose-200";
    case "high":
      return "bg-orange-100 text-orange-950 ring-orange-200";
    case "low":
      return "bg-slate-100 text-slate-800 ring-slate-200";
    default:
      return "bg-sky-50 text-sky-950 ring-sky-200";
  }
}

function entityChip(t: CrmTaskRow): string {
  if (!t.related_entity_type) return "General";
  return t.related_entity_type;
}

export function buildCrmTasksListHref(input: {
  tab: CrmTaskListTab;
  q?: string;
  priority?: CrmTaskPriority | "";
  pinnedLeadId?: string | null;
}) {
  const p = new URLSearchParams();
  p.set("tab", input.tab);
  const q = typeof input.q === "string" ? input.q.trim() : "";
  if (q) p.set("q", q);
  if (input.priority) p.set("priority", input.priority);
  const pl = typeof input.pinnedLeadId === "string" ? input.pinnedLeadId.trim() : "";
  if (pl) p.set("lead", pl);
  const qs = p.toString();
  return qs ? `/admin/crm/tasks?${qs}` : "/admin/crm/tasks";
}

export function CrmTasksPageClient(input: {
  initialTasks: CrmTaskRow[];
  staffOptions: AssignableLeadOwnerRow[];
  realtimeGateway: SaintlyRealtimeGatewayClientSnapshot;
  /** Server-resolved disclosure (`SAINTLY_OPENAI_API_BAA_CONFIRMED`); not read from public env in the browser. */
  voicePhiNotice: string;
  tab: CrmTaskListTab;
  searchInitial: string;
  priorityInitial: CrmTaskPriority | "";
  pinnedLeadId?: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [draftSearch, setDraftSearch] = useState(input.searchInitial);
  const [draftPriority, setDraftPriority] = useState<CrmTaskPriority | "">(
    input.priorityInitial || ""
  );

  useEffect(() => setDraftSearch(input.searchInitial), [input.searchInitial]);
  useEffect(() => setDraftPriority(input.priorityInitial || ""), [input.priorityInitial]);

  const assigneeLookup = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of input.staffOptions) {
      m.set(s.user_id, staffPickLabel(s));
    }
    return m;
  }, [input.staffOptions]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPri, setNewPri] = useState<CrmTaskPriority>("normal");
  const [newDue, setNewDue] = useState("");
  const [newAssignee, setNewAssignee] = useState("");

  const saveNewManual = useCallback(async () => {
    if (!newTitle.trim()) return;
    const due =
      typeof newDue === "string" && newDue.trim() ? parseAppDateTimeInputToUtcIso(newDue.trim()) : null;
    startTransition(async () => {
      const r = await createCrmTaskAction({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        priority: newPri,
        due_at: due,
        assigned_to:
          typeof newAssignee === "string" && newAssignee.trim()
            ? newAssignee.trim()
            : null,
        related_entity_type: "general",
        related_entity_id: null,
      });
      if (r.ok) {
        setCreating(false);
        setNewTitle("");
        setNewDescription("");
        router.refresh();
      }
    });
  }, [newTitle, newDescription, newPri, newDue, newAssignee, router, startTransition]);

  const toggleDone = async (t: CrmTaskRow, next: boolean) => {
    startTransition(async () => {
      const r = next ? await completeCrmTaskAction(t.id) : await reopenCrmTaskAction(t.id);
      if (r.ok) router.refresh();
    });
  };

  const cancelRow = async (id: string) => {
    startTransition(async () => {
      await cancelCrmTaskAction(id);
      router.refresh();
    });
  };

  const updateAssigneeFast = async (id: string, uid: string) => {
    const v = uid === "__none__" ? null : uid.trim() ? uid.trim() : null;
    startTransition(async () => {
      await updateCrmTaskAction(id, { assigned_to: v });
      router.refresh();
    });
  };

  const applyHref = buildCrmTasksListHref({
    tab: input.tab,
    q: draftSearch,
    priority: draftPriority || undefined,
    pinnedLeadId: input.pinnedLeadId ?? null,
  });

  const tabLinks = (
    [
      ["open", "Open"],
      ["due_today", "Due today"],
      ["overdue", "Overdue"],
      ["completed", "Completed"],
      ["all", "All"],
    ] as const
  ).map(([k, label]) => {
    const href = buildCrmTasksListHref({
      tab: k,
      q: input.searchInitial,
      priority: input.priorityInitial || undefined,
      pinnedLeadId: input.pinnedLeadId ?? null,
    });
    const active = input.tab === k;
    return (
      <Link
        key={k}
        href={href}
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
      >
        {label}
      </Link>
    );
  });

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CRM</p>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          {input.pinnedLeadId ? (
            <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
              Showing tasks linked to lead{" "}
              <span className="font-mono text-[11px]">{input.pinnedLeadId}</span>.{" "}
              <Link href={buildCrmTasksListHref({ tab: input.tab })} className="font-semibold text-sky-900 underline">
                Clear lead filter
              </Link>
            </p>
          ) : null}
          <p className="mt-1 text-sm text-slate-600">
            Manual tasks first; voice uses OpenAI (metered—separate from ChatGPT Plus subscriptions).
          </p>
        </div>
        <div className="flex min-w-[220px] flex-col items-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              onClick={() => setCreating((v) => !v)}
            >
              New Task
            </button>
            <AiVoiceTaskButton
              variant="default"
              relatedEntityType="general"
              relatedEntityId={null}
              onAfterSave={refresh}
              voicePhiNotice={input.voicePhiNotice}
            />
            <SaintlyRealtimeAssistant
              gateway={input.realtimeGateway}
              sessionContext={{}}
              voicePhiNotice={input.voicePhiNotice}
            />
          </div>
          <p className="max-w-sm text-[11px] leading-snug text-amber-950">{input.voicePhiNotice}</p>
        </div>
      </header>

      {creating ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">New task</h2>
          <div className="mt-3 grid max-w-xl gap-2">
            <label className="text-xs font-semibold text-slate-700">
              Title
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Description
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-2 text-sm"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                Priority
                <select
                  value={newPri}
                  onChange={(e) => setNewPri(e.target.value as CrmTaskPriority)}
                  className="mt-0.5 w-full rounded border border-slate-200 px-2 py-2 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Due (Phoenix wall)
                <input
                  type="datetime-local"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-200 px-2 py-2 text-sm"
                />
              </label>
            </div>
            <label className="text-xs font-semibold text-slate-700">
              Assigned to
              <select
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-2 text-sm"
              >
                <option value="">— Unassigned —</option>
                {input.staffOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {staffPickLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void saveNewManual()}
                className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Create
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Filters</span>
          <div className="flex flex-wrap gap-2">{tabLinks}</div>
          <input
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            placeholder="Search title/description"
            className="min-w-[200px] flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
          <select
            value={draftPriority}
            onChange={(e) => setDraftPriority(e.target.value as CrmTaskPriority | "")}
            className="rounded border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">All priorities</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <Link
            href={applyHref}
            className="inline-flex rounded-lg border border-slate-900 px-3 py-2 text-xs font-semibold"
          >
            Apply
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[900px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="py-2 pr-2">Done</th>
                <th className="py-2 pr-2">Task</th>
                <th className="py-2 pr-2">Due</th>
                <th className="py-2 pr-2">Priority</th>
                <th className="py-2 pr-2">Related</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Assignee</th>
                <th className="py-2 pr-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {input.initialTasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    No tasks match your filters yet.
                  </td>
                </tr>
              ) : (
                input.initialTasks.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-2 align-middle">
                      <input
                        type="checkbox"
                        checked={t.status === "done"}
                        onChange={(e) => void toggleDone(t, e.target.checked)}
                        aria-label="Mark complete"
                      />
                    </td>
                    <td className="py-2 pr-2 align-top font-medium text-slate-900">{t.title}</td>
                    <td className="py-2 pr-2 align-top text-slate-700">{t.due_at ? formatAppDateTime(t.due_at) : "—"}</td>
                    <td className="py-2 pr-2 align-top">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${priorityBadge(t.priority)}`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-2 pr-2 align-top text-xs">
                      {t.related_entity_type === "lead" && t.related_entity_id ? (
                        <Link className="text-sky-800 hover:underline" href={`/admin/crm/leads/${t.related_entity_id}`}>
                          {entityChip(t)}
                        </Link>
                      ) : (
                        <span>{entityChip(t)}</span>
                      )}
                      {t.related_entity_id ? (
                        <span className="ml-1 font-mono text-slate-500">{t.related_entity_id.slice(0, 8)}…</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 align-top text-xs text-slate-700">{t.status}</td>
                    <td className="py-2 pr-2 align-top text-xs text-slate-800">
                      {t.assigned_to ? assigneeLookup.get(t.assigned_to) ?? "—" : "—"}
                      <select
                        className="mt-1 w-full rounded border border-slate-200 px-1 py-1 text-[11px]"
                        value={t.assigned_to ?? "__none__"}
                        onChange={(e) => void updateAssigneeFast(t.id, e.target.value)}
                      >
                        <option value="__none__">Unassigned</option>
                        {input.staffOptions.map((s) => (
                          <option key={s.user_id} value={s.user_id}>
                            {staffPickLabel(s)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pl-2 text-right align-top text-xs font-semibold">
                      {t.status === "done" ? (
                        <button type="button" className="mr-2 text-sky-800 hover:underline" onClick={() => void toggleDone(t, false)}>
                          Reopen
                        </button>
                      ) : null}
                      {t.status !== "canceled" && t.status !== "done" ? (
                        <button type="button" className="text-rose-800 hover:underline" onClick={() => void cancelRow(t.id)}>
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
