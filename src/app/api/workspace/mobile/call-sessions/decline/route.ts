import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

const LOG = "[call-sessions-decline-api]";

type Body = {
  callSessionId?: string;
};

/**
 * Decline on one device — Realtime updates all devices for that user (same `call_sessions` row).
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
  if (!callSessionId) {
    return NextResponse.json({ error: "callSessionId is required" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("decline_call_session", {
    p_session_id: callSessionId,
  });

  if (error) {
    console.warn(LOG, "rpc_failed", { reqId, message: error.message });
    return NextResponse.json({ error: "Decline failed" }, { status: 500 });
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
