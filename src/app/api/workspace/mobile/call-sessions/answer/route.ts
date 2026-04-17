import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

const LOG = "[call-sessions-answer-api]";

type Body = {
  callSessionId?: string;
  deviceId?: string;
};

/**
 * Atomic answer — first device wins (RPC `answer_call_session`).
 */
export async function POST(req: Request) {
  const reqId = randomUUID();
  const user = await getAuthenticatedUser();
  const staff = await getStaffProfile();
  if (!user || !staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callSessionId =
    typeof body.callSessionId === "string" ? body.callSessionId.trim().toLowerCase() : "";
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().toLowerCase() : "";

  if (!callSessionId || !deviceId) {
    return NextResponse.json({ error: "callSessionId and deviceId are required" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("answer_call_session", {
    p_session_id: callSessionId,
    p_device_id: deviceId,
  });

  if (error) {
    console.warn(LOG, "rpc_failed", { reqId, message: error.message });
    return NextResponse.json({ error: "Answer failed" }, { status: 500 });
  }

  const payload = data as { ok?: boolean; error?: string; session?: unknown } | null;
  if (!payload?.ok) {
    console.log(LOG, "not_eligible", { reqId, reason: payload?.error ?? null });
    return NextResponse.json(
      { ok: false, reason: payload?.error ?? "not_eligible", reqId },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, reqId, session: payload.session });
}
