import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import type { FollowUpTaskStatus } from "@/lib/crm/facility-follow-up-task-types";
import { listFollowUpTasks } from "@/lib/crm/facility-follow-up-tasks";
import { notifyFollowUpTaskAssigned, queueFacilityNotification } from "@/lib/crm/facility-notifications";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type FollowUpTasksListResponse =
  | {
      ok: true;
      tasks: Awaited<ReturnType<typeof listFollowUpTasks>>["tasks"];
      summary: Awaited<ReturnType<typeof listFollowUpTasks>>["summary"];
    }
  | { ok: false; error: string };

export type CreateFollowUpTaskBody = {
  facility_id: string;
  contact_id?: string | null;
  title: string;
  description?: string | null;
  due_at: string;
  priority?: string | null;
  assigned_to?: string | null;
};

export type CreateFollowUpTaskResponse =
  | { ok: true; task_id: string }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FollowUpTasksListResponse, {
      status: 403,
    });
  }

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const status =
    statusRaw && ["open", "completed", "snoozed", "canceled"].includes(statusRaw)
      ? (statusRaw as FollowUpTaskStatus)
      : null;
  const dueRaw = url.searchParams.get("due");
  const due =
    dueRaw && ["overdue", "today", "upcoming", "all"].includes(dueRaw)
      ? (dueRaw as "overdue" | "today" | "upcoming" | "all")
      : null;
  const assigned_to = url.searchParams.get("assigned_to");
  const facility_id = url.searchParams.get("facility_id");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  try {
    const result = await listFollowUpTasks(supabaseAdmin, staff, {
      status,
      assigned_to,
      due,
      facility_id,
      limit,
    });

    return NextResponse.json({
      ok: true,
      tasks: result.tasks,
      summary: result.summary,
    } satisfies FollowUpTasksListResponse);
  } catch (e) {
    console.warn("[follow-up-tasks] list:", e);
    return NextResponse.json({ ok: false, error: "load_failed" } satisfies FollowUpTasksListResponse, {
      status: 500,
    });
  }
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies CreateFollowUpTaskResponse, {
      status: 403,
    });
  }

  const user = await getAuthenticatedUser();

  let body: CreateFollowUpTaskBody;
  try {
    body = (await req.json()) as CreateFollowUpTaskBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies CreateFollowUpTaskResponse, {
      status: 400,
    });
  }

  const facility_id = (body.facility_id ?? "").trim();
  if (!facility_id || !UUID_RE.test(facility_id)) {
    return NextResponse.json({ ok: false, error: "invalid_facility_id" } satisfies CreateFollowUpTaskResponse, {
      status: 400,
    });
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: "missing_title" } satisfies CreateFollowUpTaskResponse, {
      status: 400,
    });
  }

  const dueDate = new Date(body.due_at);
  if (Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ ok: false, error: "invalid_due_at" } satisfies CreateFollowUpTaskResponse, {
      status: 400,
    });
  }

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("id, name, assigned_rep_user_id, priority")
    .eq("id", facility_id)
    .maybeSingle();

  if (!facility?.id) {
    return NextResponse.json({ ok: false, error: "facility_not_found" } satisfies CreateFollowUpTaskResponse, {
      status: 404,
    });
  }

  const assignedRaw = (body.assigned_to ?? "").trim();
  const assigned_to =
    assignedRaw && UUID_RE.test(assignedRaw)
      ? assignedRaw
      : ((facility as { assigned_rep_user_id?: string | null }).assigned_rep_user_id ?? user?.id ?? null);

  const contactRaw = (body.contact_id ?? "").trim();
  const contact_id = contactRaw && UUID_RE.test(contactRaw) ? contactRaw : null;

  const priorityRaw = (body.priority ?? "").trim();
  const priority =
    priorityRaw === "High" || priorityRaw === "Low" || priorityRaw === "Normal" ? priorityRaw : "Normal";

  const { data: inserted, error } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .insert({
      facility_id,
      contact_id,
      assigned_to,
      title,
      description: (body.description ?? "").trim() || null,
      due_at: dueDate.toISOString(),
      status: "open",
      priority,
      source: "manual",
      created_by: user?.id ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted?.id) {
    console.warn("[follow-up-tasks] create:", error?.message);
    return NextResponse.json({ ok: false, error: "create_failed" } satisfies CreateFollowUpTaskResponse, {
      status: 500,
    });
  }

  const facilityName = String((facility as { name?: string }).name ?? "Facility");
  if (assigned_to) {
    queueFacilityNotification(() =>
      notifyFollowUpTaskAssigned({
        taskId: inserted.id as string,
        facilityId: facility_id,
        facilityName,
        title,
        assignedToUserId: assigned_to,
        dueAt: dueDate.toISOString(),
      })
    );
  }

  return NextResponse.json({ ok: true, task_id: inserted.id as string } satisfies CreateFollowUpTaskResponse);
}
