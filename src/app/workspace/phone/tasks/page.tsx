import Link from "next/link";
import { redirect } from "next/navigation";

import { assignPhoneCallTaskToMe, updatePhoneCallTaskStatus } from "@/app/admin/phone/actions";
import { supabaseAdmin } from "@/lib/admin";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

export default async function WorkspaceTasksPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
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
      emailByUserId[uid] = em || `${uid.slice(0, 8)}…`;
    }
  }

  function assignedLabel(task: TaskRow): string {
    if (!task.assigned_to_user_id) return "Unassigned";
    if (task.assigned_to_user_id === viewerUserId) return "You";
    return emailByUserId[task.assigned_to_user_id] ?? `${task.assigned_to_user_id.slice(0, 8)}…`;
  }

  const btnClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
  const btnPrimary =
    "rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100";

  return (
    <div className="px-4 pb-4 pt-4">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Tasks</h1>
      <p className="mt-0.5 text-xs text-slate-500">Follow-ups and callbacks</p>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Could not load tasks: {error.message}
        </div>
      ) : tasks.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">No active tasks.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {tasks.map((task) => {
            const call = task.phone_calls;
            const from = call?.from_e164 ?? "—";
            const canAssignToMe =
              !task.assigned_to_user_id || task.assigned_to_user_id !== staff.user_id;
            return (
              <li key={task.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{task.title}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {task.priority}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  <span className="capitalize">{task.status}</span> · {assignedLabel(task)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Due: {task.due_at ? formatAdminPhoneWhen(task.due_at) : "—"}
                </p>
                {call ? (
                  <p className="mt-2 font-mono text-xs text-slate-700">{from}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/phone/${task.phone_call_id}`}
                    className="text-xs font-semibold text-sky-800 underline"
                  >
                    Open call
                  </Link>
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
                  {canAssignToMe ? (
                    <form action={assignPhoneCallTaskToMe}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <button type="submit" className={btnClass}>
                        Assign to me
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
