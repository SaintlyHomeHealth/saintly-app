import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

const LOG = "[voice-call-event-api]";

type Body = {
  externalCallId?: string;
  event?: string;
};

/**
 * Optional client-reported events (decline from UI, etc.) to supplement Twilio webhooks.
 * Twilio remains authoritative for PSTN state; this is for analytics and future multi-device UI.
 */
export async function POST(req: Request) {
  const reqId = randomUUID();
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const externalCallId = typeof body.externalCallId === "string" ? body.externalCallId.trim() : "";
  const event = typeof body.event === "string" ? body.event.trim().toLowerCase() : "";
  if (!externalCallId || !event) {
    return NextResponse.json({ error: "externalCallId and event are required" }, { status: 400 });
  }

  const allowed = new Set(["declined", "answered", "disconnected"]);
  if (!allowed.has(event)) {
    return NextResponse.json({ error: "invalid event" }, { status: 400 });
  }

  const state =
    event === "declined" ? "declined" : event === "answered" ? "answered" : "caller_hung_up";

  const { error } = await supabaseAdmin.from("voice_call_sessions").upsert(
    {
      external_call_id: externalCallId,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "external_call_id" }
  );

  if (error) {
    console.warn(LOG, "upsert_failed", { reqId, message: error.message });
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reqId });
}
