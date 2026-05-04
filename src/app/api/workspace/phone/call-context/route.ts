import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { raceWithTimeout } from "@/lib/async/race-timeout";
import { supabaseAdmin } from "@/lib/admin";
import { buildWorkspaceCallContextPayload } from "@/lib/phone/build-workspace-call-context";
import { canAccessWorkspacePhone, resolveStaffProfileForWorkspacePhoneApi } from "@/lib/staff-profile";

/**
 * Live caller context for the workspace softphone (AI summary + transcript + conference gating).
 * Query: `call_sid` — Twilio CallSid on the Client leg (`phone_calls.external_call_id`).
 *
 * Hot path: strict timeouts + degraded JSON so pollers never wedge middleware/Vercel.
 */
export const dynamic = "force-dynamic";

const AUTH_BUDGET_MS = 4_000;
const CONTEXT_BUDGET_MS = 7_500;

function logCallContext(event: string, payload: Record<string, unknown>) {
  console.warn("[workspace/phone/call-context]", JSON.stringify({ event, ...payload }));
}

export async function GET(req: NextRequest) {
  const started = Date.now();

  const url = new URL(req.url);
  const callSid = (url.searchParams.get("call_sid") ?? "").trim();
  if (!callSid || callSid.length < 10) {
    logCallContext("reject_bad_call_sid", { ms: Date.now() - started });
    return NextResponse.json({ ok: false, error: "call_sid required" }, { status: 400 });
  }

  const authStarted = Date.now();
  const authResult = await raceWithTimeout(
    resolveStaffProfileForWorkspacePhoneApi(req),
    AUTH_BUDGET_MS,
    "auth"
  );
  const authMs = Date.now() - authStarted;

  if (!authResult.ok) {
    logCallContext("auth_timeout_or_error", {
      ms: Date.now() - started,
      authMs,
      timedOut: authResult.timedOut,
      error: authResult.error,
    });
    return NextResponse.json(
      {
        ok: true,
        degraded: true,
        reason: authResult.timedOut ? "auth_timeout" : "auth_unavailable",
        found: false,
      },
      { status: 200 }
    );
  }

  const staff = authResult.value;
  if (!staff || !canAccessWorkspacePhone(staff)) {
    logCallContext("unauthorized", { ms: Date.now() - started, authMs, hasStaff: Boolean(staff) });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ctxStarted = Date.now();
  const builtResult = await raceWithTimeout(
    buildWorkspaceCallContextPayload(supabaseAdmin, callSid, { skipTwilioRestFallback: true }),
    CONTEXT_BUDGET_MS,
    "call_context_build"
  );
  const ctxMs = Date.now() - ctxStarted;
  const totalMs = Date.now() - started;

  if (!builtResult.ok) {
    logCallContext("context_timeout_or_error", {
      totalMs,
      authMs,
      ctxMs,
      timedOut: builtResult.timedOut,
      error: builtResult.error,
      callSid: `${callSid.slice(0, 10)}…`,
    });
    return NextResponse.json(
      {
        ok: true,
        degraded: true,
        reason: builtResult.timedOut ? "context_timeout" : "context_unavailable",
        found: false,
      },
      { status: 200 }
    );
  }

  const built = builtResult.value;
  if (!built.found) {
    logCallContext("not_found", { totalMs, authMs, ctxMs, callSid: `${callSid.slice(0, 10)}…` });
    return NextResponse.json({ ok: true, degraded: false, found: false }, { status: 200 });
  }

  logCallContext("ok", {
    totalMs,
    authMs,
    ctxMs,
    callSid: `${callSid.slice(0, 10)}…`,
    phoneCallId: built.payload.phone_call_id,
  });

  return NextResponse.json({
    ok: true,
    degraded: false,
    found: true,
    ...built.payload,
  });
}
