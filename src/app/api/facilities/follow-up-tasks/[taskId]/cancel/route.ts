import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { cancelFollowUpTask } from "@/lib/crm/facility-follow-up-tasks";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type CancelFollowUpTaskBody = {
  reason?: string | null;
};

export type CancelFollowUpTaskResponse = { ok: true } | { ok: false; error: string };

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies CancelFollowUpTaskResponse, {
      status: 403,
    });
  }

  const { taskId } = await context.params;

  if (!taskId || !/^[0-9a-f-]{36}$/i.test(taskId)) {
    return NextResponse.json({ ok: false, error: "invalid_task_id" } satisfies CancelFollowUpTaskResponse, {
      status: 400,
    });
  }

  let body: CancelFollowUpTaskBody = {};
  try {
    body = (await req.json()) as CancelFollowUpTaskBody;
  } catch {
    body = {};
  }

  const result = await cancelFollowUpTask(supabaseAdmin, taskId, body.reason);

  if (!result.ok) {
    const status = result.error === "task_not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: result.error } satisfies CancelFollowUpTaskResponse, {
      status,
    });
  }

  return NextResponse.json({ ok: true } satisfies CancelFollowUpTaskResponse);
}
