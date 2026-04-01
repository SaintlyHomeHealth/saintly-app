import Link from "next/link";
import { redirect } from "next/navigation";

import { assignPhoneCallTaskToMe, updatePhoneCallTaskStatus } from "../actions";
import { supabaseAdmin } from "@/lib/admin";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { getStaffProfile, isPhoneWorkspaceUser } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Nested `phone_calls` embed uses public.phone_calls columns from_e164, to_e164 (see schema). */
type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
  phone_call_id: string;
  phone_calls: {
    id: string;
    from_e164: string | null;
    to_e164: string | null;
    status: string;
    created_at: string;
  } | null;
};

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

function sortTasks(a: TaskRow, b: TaskRow): number {
  const pa = PRIORITY_RANK[a.priority] ?? 0;
  const pb = PRIORITY_RANK[b.priority] ?? 0;
  if (pb !== pa) return pb - pa;
  const da = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
  const db = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export default async function PhoneTasksPage() {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    redirect("/admin");
  }

  const viewerUserId = staff.user_id;

  const supabase = await createServerSupabaseClient();

  const { data: rawRows, error } = await supabase
    .from("phone_call_tasks")
    .select(
      `
      id,
      title,
      status,
      priority,
      due_at,
      assigned_to_user_id,
      created_at,
      phone_call_id,
      phone_calls (
        id,
        from_e164,
        to_e164,
        status,
        created_at
      )
    `
    )
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false });

  const tasks = ((rawRows ?? []) as unknown as TaskRow[]).slice().sort(sortTasks);

  const assigneeIds = [...new Set(tasks.map((t) => t.assigned_to_user_id).filter(Boolean))] as string[];
  const emailByUserId: Record<string, string> = {};
  if (assigneeIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email")
      .in("user_id", assigneeIds);
    for (const p of profiles ?? []) {
      const uid = p.user_id as string;
      const em = (p.email as string | null)?.trim();
      emailByUserId[uid] = em || uid.slice(0, 8) + "…";
    }
  }

  function assignedLabel(task: TaskRow): string {
    if (!task.assigned_to_user_id) return "Unassigned";
    if (task.assigned_to_user_id === viewerUserId) return "You";
    return emailByUserId[task.assigned_to_user_id] ?? task.assigned_to_user_id.slice(0, 8) + "…";
  }

  const btnClass =
    "rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50";
  const btnPrimary = "rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 hover:bg-sky-100";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone CRM</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">My Tasks</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Open and in-progress follow-ups tied to phone calls.
          </p>
        </div>
        <Link
          href="/admin/phone"
          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Phone calls
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load tasks: {error.message}
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-slate-600">No active tasks.</p>
      ) : (
        <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Title</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                <th className="whitespace-nowrap px-4 py-3">Priority</th>
                <th className="min-w-[120px] px-4 py-3">Assigned</th>
                <th className="whitespace-nowrap px-4 py-3">Due</th>
                <th className="min-w-[160px] px-4 py-3">Call</th>
                <th className="min-w-[200px] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const call = task.phone_calls;
                const from = call?.from_e164 ?? "—";
                const canAssignToMe =
                  !task.assigned_to_user_id || task.assigned_to_user_id !== staff.user_id;
                return (
                  <tr key={task.id} className="border-b border-slate-100 last:border-0">
                    <td className="max-w-[220px] px-4 py-3 text-slate-800">
                      <span className="font-medium">{task.title}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{task.status}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{task.priority}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{assignedLabel(task)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {task.due_at ? formatAdminPhoneWhen(task.due_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      <div className="font-mono">{from}</div>
                      {call ? (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Call: {call.status} · {formatAdminPhoneWhen(call.created_at)}
                        </div>
                      ) : null}
                      <Link
                        href={`/admin/phone/${task.phone_call_id}`}
                        className="mt-1 inline-block text-[11px] font-semibold text-sky-800 underline"
                      >
                        Open call
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {task.status === "open" ? (
                          <form action={updatePhoneCallTaskStatus}>
                            <input type="hidden" name="taskId" value={task.id} />
                            <input type="hidden" name="status" value="in_progress" />
                            <button type="submit" className={btnPrimary}>
                              Start
                            </button>
                          </form>
                        ) : null}
                        {task.status === "open" || task.status === "in_progress" ? (
                          <form action={updatePhoneCallTaskStatus}>
                            <input type="hidden" name="taskId" value={task.id} />
                            <input type="hidden" name="status" value="completed" />
                            <button type="submit" className={btnClass}>
                              Complete
                            </button>
                          </form>
                        ) : null}
                        {task.status === "open" || task.status === "in_progress" ? (
                          <form action={updatePhoneCallTaskStatus}>
                            <input type="hidden" name="taskId" value={task.id} />
                            <input type="hidden" name="status" value="canceled" />
                            <button type="submit" className={btnClass}>
                              Cancel
                            </button>
                          </form>
                        ) : null}
                        {canAssignToMe ? (
                          <form action={assignPhoneCallTaskToMe}>
                            <input type="hidden" name="taskId" value={task.id} />
                            <button type="submit" className={btnClass}>
                              Assign to me
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
