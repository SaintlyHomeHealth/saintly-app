import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { ensureIncomingCallAlert } from "@/lib/phone/incoming-call-alerts";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { buildTwiMLAppIncomingClientRingTwiml } from "@/lib/phone/twilio-voice-handoff";
import { buildRealtimeConnectStreamTwiml } from "@/lib/phone/twilio-realtime-stream-twiml";
import {
  getRealtimeInboundGateSnapshot,
  resolveTwilioRealtimeMediaStreamWssUrl,
  type RealtimeInboundGateSnapshot,
} from "@/lib/phone/twilio-voice-realtime-gate";
import { isTwilioVoiceJsClientFrom, isTwilioVoiceJsClientTo } from "@/lib/twilio/twilio-voice-client-leg";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Isolation test: when true, gate-fail returns Hangup (no ai-answer). Keep false in production.
 */
const TWILIO_REALTIME_ISOLATION_FAIL_CLOSED = false;

const TWIML_HANGUP = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Same precedence as {@link ../route.ts} `resolveVoicePublicBase`: env first, then request origin.
 * Without this, `TWILIO_PUBLIC_BASE_URL` unset in Vercel yields an empty `statusCallback` on `<Stream>`,
 * so Twilio never POSTs to `/api/twilio/voice/status` and rows stay `initiated`.
 */
function resolvePublicBase(req: NextRequest): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    new URL(req.url).origin
  );
}

function shortCallSid(callSid: string): string {
  return callSid.length > 12 ? `${callSid.slice(0, 12)}…` : callSid;
}

function streamUrlLogFields(streamUrlTrimmed: string): {
  streamUrlLength: number;
  streamUrlHost?: string;
  streamUrlPath?: string;
} {
  if (!streamUrlTrimmed) return { streamUrlLength: 0 };
  try {
    const u = new URL(streamUrlTrimmed);
    const streamUrlPath = `${u.pathname}${u.search}`;
    return { streamUrlLength: streamUrlTrimmed.length, streamUrlHost: u.host, streamUrlPath };
  } catch {
    return { streamUrlLength: streamUrlTrimmed.length };
  }
}

/** Ordered reasons matching current gating (informational only; routing unchanged). */
function realtimeInboundSkipReasons(s: RealtimeInboundGateSnapshot): string[] {
  const reasons: string[] = [];
  if (!s.streamUrlPresent) {
    reasons.push("missing_or_empty_media_stream_wss_url_TWILIO_SOFTPHONE_or_TWILIO_REALTIME");
  }
  if (!s.realtimeEnabled) {
    reasons.push("realtime_disabled_TWILIO_VOICE_REALTIME_ENABLED_not_true");
  }
  if (s.allowlistRawLength === 0) {
    reasons.push("empty_TWILIO_VOICE_REALTIME_ALLOWLIST");
  } else if (!s.fromInAllowlist) {
    reasons.push("caller_not_in_allowlist");
  }
  if (s.streamUrlPresent && !s.streamUrlValidWssFormat) {
    reasons.push("stream_url_invalid_not_wss_format");
  }
  return reasons;
}

/**
 * Single log line to diff per caller: TwiML branch + allowlist snapshot (behavior unchanged).
 */
function logCallerBranch(input: {
  twimlResponse:
    | "connect_stream"
    | "redirect_post_ai_answer"
    | "hangup_fail_closed"
    | "hangup_missing_required_fields"
    | "twiml_say_missing_required_fields"
    | "twiml_say_missing_public_base";
  gateSnap: RealtimeInboundGateSnapshot;
  callSid: string;
  callerFromRaw: string;
  to?: string;
  skipReasons?: string[];
  extra?: Record<string, unknown>;
}): void {
  const { gateSnap, extra, skipReasons, ...rest } = input;
  console.log("[twilio/voice/realtime][caller-branch]", {
    ...rest,
    callSid: shortCallSid(input.callSid),
    callerNormalized: gateSnap.fromE164,
    allowlistEntries: gateSnap.allowlistEntries,
    allowlistWildcardEnabled: gateSnap.allowlistWildcardEnabled,
    allowlistExplicitNumberMatch: gateSnap.allowlistExplicitNumberMatch,
    allowlistMatch: gateSnap.fromInAllowlist,
    shouldUseInbound: gateSnap.shouldUseInbound,
    useRealtime: gateSnap.useRealtime,
    realtimeEnabledEnv: gateSnap.realtimeEnabled,
    streamUrlPresent: gateSnap.streamUrlPresent,
    skipReasons: skipReasons ?? realtimeInboundSkipReasons(gateSnap),
    ...extra,
  });
}

/**
 * OpenAI Realtime entry: returns TwiML that connects a bidirectional Media Stream to your bridge WSS URL.
 * Fallback: normally Redirect to {@link ../ai-answer/route.ts}; when {@link TWILIO_REALTIME_ISOLATION_FAIL_CLOSED}
 * is true, returns Hangup instead (temporary isolation test).
 *
 * Twilio Console: optional Voice webhook POST to `{PUBLIC_BASE}/api/twilio/voice/realtime`
 * (does not replace `/api/twilio/voice` unless you configure it that way).
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params;
  const callerFromRaw = typeof params.From === "string" ? params.From : "";
  const callSid = params.CallSid?.trim();
  const from = params.From?.trim();
  const to = params.To?.trim();

  if (!callSid || !from || !to) {
    console.warn("[twilio/voice/realtime][diag] FALLBACK=twiml_say_missing_required_fields", {
      reason: "missing_CallSid_From_or_To",
      callSidPresent: Boolean(callSid),
      fromPresent: Boolean(from),
      toPresent: Boolean(to),
      callSid: callSid ? shortCallSid(callSid) : null,
      from: from || null,
      to: to || null,
      isolationFailClosed: TWILIO_REALTIME_ISOLATION_FAIL_CLOSED,
    });
    const gateSnapPartial = getRealtimeInboundGateSnapshot(from || "");
    logCallerBranch({
      twimlResponse: TWILIO_REALTIME_ISOLATION_FAIL_CLOSED
        ? "hangup_missing_required_fields"
        : "twiml_say_missing_required_fields",
      gateSnap: gateSnapPartial,
      callSid: callSid || "(no-sid)",
      callerFromRaw,
      to: to || undefined,
      skipReasons: realtimeInboundSkipReasons(gateSnapPartial),
      extra: {
        hadCallSid: Boolean(callSid),
        hadFrom: Boolean(from),
        hadTo: Boolean(to),
      },
    });
    const xml = TWILIO_REALTIME_ISOLATION_FAIL_CLOSED
      ? TWIML_HANGUP
      : `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We are sorry, this call could not be connected.</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const publicBase = resolvePublicBase(req);

  if (isTwilioVoiceJsClientFrom(from)) {
    if (!publicBase) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
        "Our phone system URL is not configured. Please try again later."
      )}</Say></Response>`;
      return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }
    const softphoneUrl = `${publicBase}/api/twilio/voice/softphone`;
    console.warn("[twilio/voice/realtime] bypassing_ai_redirecting_softphone_client_from", {
      callSid: shortCallSid(callSid),
      redirect_to: softphoneUrl,
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
      softphoneUrl
    )}</Redirect></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (isTwilioVoiceJsClientTo(to) && publicBase) {
    const twiml = buildTwiMLAppIncomingClientRingTwiml({
      publicBase,
      toClientUri: to!,
      pstnCallerE164: from ?? "",
    });
    if (twiml) {
      console.warn("[twilio/voice/realtime] bypassing_ai_incoming_client_to", {
        callSid: shortCallSid(callSid),
      });
      return new NextResponse(twiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }
  }

  const logResult = await upsertPhoneCallFromWebhook(supabaseAdmin, {
    external_call_id: callSid,
    direction: "inbound",
    from_e164: from,
    to_e164: to,
    status: "initiated",
    event_type: "call.incoming",
    started_at: new Date().toISOString(),
    metadata: { source: "twilio_voice_openai_realtime" },
  });

  if (!logResult.ok) {
    console.error("[twilio/voice/realtime] phone log failed:", logResult.error);
  } else {
    console.log("[parent-call]", {
      event: "realtime_upsert_ok",
      phone_calls_id: logResult.callId,
      external_call_id: callSid,
      source: "twilio_voice_openai_realtime",
    });
    const alertResult = await ensureIncomingCallAlert(supabaseAdmin, {
      phone_call_id: logResult.callId,
      external_call_id: callSid,
      from_e164: from,
      to_e164: to,
    });
    if (!alertResult.ok) {
      console.error("[twilio/voice/realtime] incoming_call_alerts:", alertResult.error);
    }
  }

  const streamWss = resolveTwilioRealtimeMediaStreamWssUrl();
  const gateSnap = getRealtimeInboundGateSnapshot(from);
  const useRealtime = gateSnap.useRealtime;
  const skipReasons = realtimeInboundSkipReasons(gateSnap);

  if (useRealtime) {
    const streamFields = streamUrlLogFields(gateSnap.streamUrlTrimmed);
    console.log("[twilio/voice/realtime][diag][isolation] ENTERING_REALTIME_BRANCH", {
      callSid: shortCallSid(callSid),
      from: gateSnap.fromE164,
      to,
      allowlistMatch: gateSnap.fromInAllowlist,
      streamUrlHost: streamFields.streamUrlHost,
      streamUrlPath: streamFields.streamUrlPath,
      streamUrlLength: streamFields.streamUrlLength,
    });
    if (!gateSnap.streamUrlValidWssFormat) {
      console.warn("[twilio/voice/realtime][diag] PATH=connect_stream WARNING_stream_url_not_wss", {
        callSid: shortCallSid(callSid),
        from: gateSnap.fromE164,
        allowlistMatch: gateSnap.fromInAllowlist,
        ...streamFields,
      });
    }
    const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
    const twiml = buildRealtimeConnectStreamTwiml({
      streamWssUrl: streamWss,
      statusCallbackUrl: statusCallbackUrl || undefined,
    });
    console.log("[twilio/voice/realtime] status_callback_for_stream", {
      public_base_source: process.env.TWILIO_PUBLIC_BASE_URL
        ? "TWILIO_PUBLIC_BASE_URL"
        : process.env.TWILIO_WEBHOOK_BASE_URL
          ? "TWILIO_WEBHOOK_BASE_URL"
          : "request_origin",
      status_callback_url: statusCallbackUrl || null,
    });
    const twimlHasConnect = twiml.includes("<Connect>");
    const twimlHasStream = /<Stream\s/i.test(twiml);
    console.log("[twilio/voice/realtime][diag][isolation] RETURNING_CONNECT_STREAM_TWIML", {
      callSid: shortCallSid(callSid),
      from: gateSnap.fromE164,
      returnedConnectStreamTwiml: true,
      twimlHasConnect,
      twimlHasStream,
      twimlUtf8ByteLength: new TextEncoder().encode(twiml).length,
      streamUrlHost: streamFields.streamUrlHost,
      streamUrlPath: streamFields.streamUrlPath,
    });
    logCallerBranch({
      twimlResponse: "connect_stream",
      gateSnap,
      callSid,
      callerFromRaw,
      to,
      skipReasons: [],
      extra: {
        twimlHasConnect,
        twimlHasStream,
        streamUrlHost: streamFields.streamUrlHost,
        streamUrlPath: streamFields.streamUrlPath,
      },
    });
    return new NextResponse(twiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.warn("[twilio/voice/realtime][diag] REALTIME_SKIPPED", {
    callSid: shortCallSid(callSid),
    from: gateSnap.fromE164,
    allowlistNormalizedEntries: gateSnap.allowlistEntries,
    allowlistMatch: gateSnap.fromInAllowlist,
    skipReasons,
    realtimeEnabled: gateSnap.realtimeEnabled,
    ...streamUrlLogFields(gateSnap.streamUrlTrimmed),
  });

  if (TWILIO_REALTIME_ISOLATION_FAIL_CLOSED) {
    console.warn("[twilio/voice/realtime][diag][isolation] FAIL_CLOSED_HANGUP_no_ai_answer_redirect", {
      callSid: shortCallSid(callSid),
      from: gateSnap.fromE164,
      skipReasons,
      hadPublicBase: Boolean(publicBase),
    });
    logCallerBranch({
      twimlResponse: "hangup_fail_closed",
      gateSnap,
      callSid,
      callerFromRaw,
      to,
      skipReasons,
      extra: { hadPublicBase: Boolean(publicBase) },
    });
    return new NextResponse(TWIML_HANGUP, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  if (!publicBase) {
    console.warn("[twilio/voice/realtime][diag] FALLBACK=twiml_say_missing_public_base", {
      reason: "missing_TWILIO_PUBLIC_BASE_URL_and_TWILIO_WEBHOOK_BASE_URL",
      callSid: shortCallSid(callSid),
      from: gateSnap.fromE164,
      skipReasons,
      wouldHaveRedirectedToAiAnswerIfBaseConfigured: true,
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Our phone system URL is not configured. Please try again later."
    )}</Say></Response>`;
    logCallerBranch({
      twimlResponse: "twiml_say_missing_public_base",
      gateSnap,
      callSid,
      callerFromRaw,
      to,
      skipReasons,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.warn("[twilio/voice/realtime][diag] FALLBACK=redirect_POST_ai-answer", {
    callSid: shortCallSid(callSid),
    from: gateSnap.fromE164,
    allowlistMatch: gateSnap.fromInAllowlist,
    allowlistNormalizedEntries: gateSnap.allowlistEntries,
    skipReasons,
    redirectUrl: `${publicBase}/api/twilio/voice/ai-answer`,
  });
  logCallerBranch({
    twimlResponse: "redirect_post_ai_answer",
    gateSnap,
    callSid,
    callerFromRaw,
    to,
    skipReasons,
    extra: { redirectUrl: `${publicBase}/api/twilio/voice/ai-answer` },
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
    `${publicBase}/api/twilio/voice/ai-answer`
  )}</Redirect></Response>`;
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
