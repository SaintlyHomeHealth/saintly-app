import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { snoozeFollowUpTask } from "@/lib/crm/facility-follow-up-tasks";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type SnoozeFollowUpTaskBody = {
  snoozed_until: string;
  reason?: string | null;
};

export type SnoozeFollowUpTaskResponse = { ok: true } | { ok: false; error: string };

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies SnoozeFollowUpTaskResponse, {
      status: 403,
    });
  }

  const { taskId } = await context.params;

  if (!taskId || !/^[0-9a-f-]{36}$/i.test(taskId)) {
    return NextResponse.json({ ok: false, error: "invalid_task_id" } satisfies SnoozeFollowUpTaskResponse, {
      status: 400,
    });
  }

  let body: SnoozeFollowUpTaskBody;
  try {
    body = (await req.json()) as SnoozeFollowUpTaskBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies SnoozeFollowUpTaskResponse, {
      status: 400,
    });
  }

  const result = await snoozeFollowUpTask(
    supabaseAdmin,
    taskId,
    body.snoozed_until,
    body.reason
  );

  if (!result.ok) {
    const status =
      result.error === "task_not_found" ? 404 : result.error === "invalid_date" ? 400 : 500;
    return NextResponse.json({ ok: false, error: result.error } satisfies SnoozeFollowUpTaskResponse, {
      status,
    });
  }

  return NextResponse.json({ ok: true } satisfies SnoozeFollowUpTaskResponse);
}
