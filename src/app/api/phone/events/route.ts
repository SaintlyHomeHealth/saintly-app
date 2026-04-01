import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { appendPhoneCallEventByExternalId } from "@/lib/phone/log-call";
import { isPhoneWebhookAuthorized } from "@/lib/phone/webhook-auth";

type EventsBody = {
  external_call_id?: unknown;
  event_type?: unknown;
  payload?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Append-only event log for an existing call (same auth as /api/phone/webhook).
 */
export async function POST(req: NextRequest) {
  if (!isPhoneWebhookAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EventsBody;
  try {
    body = (await req.json()) as EventsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const externalCallId =
    typeof body.external_call_id === "string" ? body.external_call_id.trim() : "";
  const eventType = typeof body.event_type === "string" ? body.event_type.trim() : "";

  if (!externalCallId) {
    return NextResponse.json({ error: "external_call_id is required" }, { status: 400 });
  }
  if (!eventType) {
    return NextResponse.json({ error: "event_type is required" }, { status: 400 });
  }

  const result = await appendPhoneCallEventByExternalId(
    supabaseAdmin,
    externalCallId,
    eventType,
    asRecord(body.payload)
  );

  if (!result.ok) {
    const status = result.error === "Call not found for external_call_id" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, call_id: result.callId });
}
