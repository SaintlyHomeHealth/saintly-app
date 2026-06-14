import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { completeFollowUpTask } from "@/lib/crm/facility-follow-up-tasks";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type CompleteFollowUpTaskBody = {
  completion_note?: string | null;
  create_activity?: boolean;
};

export type CompleteFollowUpTaskResponse = { ok: true } | { ok: false; error: string };

export async function POST(
  req: Request,
  context: { params: Promise<{ taskId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies CompleteFollowUpTaskResponse, {
      status: 403,
    });
  }

  const user = await getAuthenticatedUser();
  const { taskId } = await context.params;

  if (!taskId || !/^[0-9a-f-]{36}$/i.test(taskId)) {
    return NextResponse.json({ ok: false, error: "invalid_task_id" } satisfies CompleteFollowUpTaskResponse, {
      status: 400,
    });
  }

  let body: CompleteFollowUpTaskBody = {};
  try {
    body = (await req.json()) as CompleteFollowUpTaskBody;
  } catch {
    body = {};
  }

  const result = await completeFollowUpTask(supabaseAdmin, taskId, user?.id ?? null, body);

  if (!result.ok) {
    const status = result.error === "task_not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: result.error } satisfies CompleteFollowUpTaskResponse, {
      status,
    });
  }

  return NextResponse.json({ ok: true } satisfies CompleteFollowUpTaskResponse);
}
