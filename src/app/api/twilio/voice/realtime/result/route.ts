import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  persistRealtimeSessionToCrm,
  type RealtimeRouteIntent,
} from "@/lib/phone/realtime-voice-ai-result";

const ALLOWED: ReadonlySet<string> = new Set(["patient", "referral", "spam", "urgent_medical"]);

function isIntent(v: unknown): v is RealtimeRouteIntent {
  return typeof v === "string" && ALLOWED.has(v);
}

/**
 * Internal callback from the Twilio↔OpenAI Realtime bridge after `route_call`.
 * Secured with REALTIME_BRIDGE_SHARED_SECRET (header or body).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const headerSecret = req.headers.get("X-Realtime-Bridge-Secret")?.trim();
  if (headerSecret !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const o = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!o) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const externalCallId = typeof o.external_call_id === "string" ? o.external_call_id.trim() : "";
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const intentRaw = o.intent;
  const transcriptExcerpt =
    typeof o.transcript_excerpt === "string" ? o.transcript_excerpt.trim() : undefined;

  if (!externalCallId || !summary) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  if (!isIntent(intentRaw)) {
    return NextResponse.json({ ok: false, error: "invalid_intent" }, { status: 400 });
  }

  const result = await persistRealtimeSessionToCrm(supabaseAdmin, {
    externalCallId,
    intent: intentRaw,
    summary,
    transcriptExcerpt,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, callId: result.callId });
}
