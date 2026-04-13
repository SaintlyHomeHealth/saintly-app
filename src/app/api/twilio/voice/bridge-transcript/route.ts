import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";

/**
 * Incremental caller transcript from the Railway Twilio↔OpenAI bridge (Media Streams).
 * Secured with REALTIME_BRIDGE_SHARED_SECRET (same header as realtime/result).
 * Appends into `metadata.voice_ai.live_transcript_excerpt` for workspace caller context.
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

  let body: { external_call_id?: string; text?: string };
  try {
    body = (await req.json()) as { external_call_id?: string; text?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const externalCallId = typeof body.external_call_id === "string" ? body.external_call_id.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!externalCallId.startsWith("CA") || !text) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  const { data: row, error: selErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, metadata")
    .eq("external_call_id", externalCallId)
    .maybeSingle();

  if (selErr || !row?.id) {
    return NextResponse.json({ ok: false, error: "call_not_found" }, { status: 404 });
  }

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const prevVoice =
    meta.voice_ai && typeof meta.voice_ai === "object" && !Array.isArray(meta.voice_ai)
      ? (meta.voice_ai as Record<string, unknown>)
      : {};
  const prevTx = typeof prevVoice.live_transcript_excerpt === "string" ? prevVoice.live_transcript_excerpt.trim() : "";
  const nextTx = prevTx ? `${prevTx}\n${text}` : text;
  const clipped = nextTx.length > 8000 ? nextTx.slice(-8000) : nextTx;

  meta.voice_ai = {
    ...prevVoice,
    live_transcript_excerpt: clipped.slice(0, 5000),
    source: typeof prevVoice.source === "string" ? prevVoice.source : "live_receptionist",
  };

  const { error: upErr } = await supabaseAdmin.from("phone_calls").update({ metadata: meta }).eq("id", row.id);
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
