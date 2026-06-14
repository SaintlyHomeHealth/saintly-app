import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { rescheduleFollowUpTask } from "@/lib/crm/facility-follow-up-tasks";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type RescheduleFollowUpTaskBody = {
  due_at: string;
  note?: string | null;
};

export type RescheduleFollowUpTaskResponse = { ok: true } | { ok: false; error: string };

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies RescheduleFollowUpTaskResponse, {
      status: 403,
    });
  }

  const { taskId } = await context.params;

  if (!taskId || !/^[0-9a-f-]{36}$/i.test(taskId)) {
    return NextResponse.json({ ok: false, error: "invalid_task_id" } satisfies RescheduleFollowUpTaskResponse, {
      status: 400,
    });
  }

  let body: RescheduleFollowUpTaskBody;
  try {
    body = (await req.json()) as RescheduleFollowUpTaskBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies RescheduleFollowUpTaskResponse, {
      status: 400,
    });
  }

  const result = await rescheduleFollowUpTask(supabaseAdmin, taskId, body.due_at, body.note);

  if (!result.ok) {
    const status =
      result.error === "task_not_found" ? 404 : result.error === "invalid_date" ? 400 : 500;
    return NextResponse.json({ ok: false, error: result.error } satisfies RescheduleFollowUpTaskResponse, {
      status,
    });
  }

  return NextResponse.json({ ok: true } satisfies RescheduleFollowUpTaskResponse);
}
