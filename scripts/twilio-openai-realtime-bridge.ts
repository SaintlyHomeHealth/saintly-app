/**
 * Long-lived WebSocket bridge: Twilio Media Streams (g711_ulaw) ↔ OpenAI Realtime API.
 *
 * Run (from repo root, with env set):
 *   npx tsx scripts/twilio-openai-realtime-bridge.ts
 *
 * Required env:
 *   OPENAI_API_KEY
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_VOICE_RING_E164 — PSTN transfer target
 *   TWILIO_VOICE_PRIORITY_E164 — optional urgent target (falls back to ring E164)
 *   APP_PUBLIC_BASE_URL — https://your.app (for POST /api/twilio/voice/realtime/result)
 *   REALTIME_BRIDGE_SHARED_SECRET — must match Next.js env
 *
 * Optional:
 *   OPENAI_REALTIME_MODEL (default gpt-4o-realtime-preview-2024-12-17)
 *   REALTIME_BRIDGE_PORT (default 8080)
 *   REALTIME_WS_PATH (default /twilio/realtime-stream)
 *   REALTIME_BRIDGE_HEARTBEAT_MS (default 12000) — alive log interval
 *
 * Temporary diagnostics:
 *   REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER=false — force-enable transfers (overrides in-code FORCE_DIAG_SUPPRESS_TRANSFER).
 *   REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER=true — suppress transfers (redundant if FORCE_DIAG_SUPPRESS_TRANSFER is true).
 *   REALTIME_DIAG_RESPONSE_CREATE_ON_CONNECT=false — disable immediate greeting after session.update.
 *   REALTIME_BRIDGE_VERBOSE_AUDIO_LOG=true — log every input_audio_buffer.append / audio delta (very noisy).
 */

import * as http from "node:http";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";

import twilio from "twilio";
import { WebSocket, WebSocketServer } from "ws";

import {
  VOICE_AI_REALTIME_INSTRUCTIONS,
  VOICE_AI_REALTIME_TOOLS,
} from "../src/lib/phone/voice-ai-realtime-system-prompt";
import { isPstnHandoffAiLoopRisk } from "../src/lib/phone/twilio-voice-pstn-loop-guard";

const MODEL =
  process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-4o-realtime-preview-2024-12-17";
const PORT = Number.parseInt(process.env.REALTIME_BRIDGE_PORT || "8080", 10) || 8080;
const WS_PATH = process.env.REALTIME_WS_PATH?.trim() || "/twilio/realtime-stream";

const HEARTBEAT_MS = Number.parseInt(process.env.REALTIME_BRIDGE_HEARTBEAT_MS || "12000", 10) || 12000;

/**
 * TEMP diagnostics: send `response.create` right after `session.update` so the assistant speaks without
 * waiting for caller VAD. Set false after confirming outbound audio path.
 */
const REALTIME_DIAG_RESPONSE_CREATE_ON_CONNECT =
  process.env.REALTIME_DIAG_RESPONSE_CREATE_ON_CONNECT?.trim() !== "false";

const _suppressTransferEnv = process.env.REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER?.trim();
/** Set to "true" to disable AI→human Twilio redirects (debug only). */
const REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER = _suppressTransferEnv === "true";

const REALTIME_BRIDGE_VERBOSE_AUDIO_LOG =
  process.env.REALTIME_BRIDGE_VERBOSE_AUDIO_LOG?.trim() === "true";

/** Required for full bridge behavior; server still listens if any are missing (logged at boot). */
const REQUIRED_ENV_NAMES = [
  "OPENAI_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VOICE_RING_E164",
  "APP_PUBLIC_BASE_URL",
  "REALTIME_BRIDGE_SHARED_SECRET",
] as const;

function maskEnvAuditLine(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) return `${name}=MISSING`;
  const sensitive = /KEY|TOKEN|SECRET|PASSWORD|AUTH/i.test(name);
  if (sensitive) {
    return `${name}=set (len=${v.length}, head=${JSON.stringify(v.slice(0, 2))}…)`;
  }
  if (name.includes("URL") || name.includes("BASE")) {
    const u = v.replace(/\/$/, "");
    return `${name}=set (len=${u.length}, host=${tryHost(u)})`;
  }
  if (name.includes("E164") || name.endsWith("_SID")) {
    return `${name}=set (len=${v.length}, tail=…${v.slice(-4)})`;
  }
  return `${name}=set (len=${v.length})`;
}

function tryHost(urlish: string): string {
  try {
    return new URL(urlish).host || "(no host)";
  } catch {
    return "(unparseable)";
  }
}

function logStartupEnvAudit(): void {
  console.log("[realtime-bridge] startup env audit (values masked):");
  for (const name of REQUIRED_ENV_NAMES) {
    console.log(`[realtime-bridge]   ${maskEnvAuditLine(name)}`);
  }
  const missing = REQUIRED_ENV_NAMES.filter((n) => !process.env[n]?.trim());
  if (missing.length > 0) {
    console.error(
      "[realtime-bridge] startup WARNING: missing env — server will listen but stream/handoffs may fail:",
      missing.join(", ")
    );
  }
}

function startHeartbeat(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    console.log("[realtime-bridge] heartbeat", {
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      port: PORT,
      wsPath: WS_PATH,
    });
  }, HEARTBEAT_MS);
}

/** What applyTwilioRoute would do (for isolation logs only). */
function describeWouldBeTransfer(intent: string): {
  twilioAction: "hangup_twiml" | "dial_priority" | "dial_ring";
  targetNumberTail: string | null;
} {
  const ring = process.env.TWILIO_VOICE_RING_E164?.trim() || "";
  const priority = process.env.TWILIO_VOICE_PRIORITY_E164?.trim() || ring;
  const tail = (e164: string) => (e164.length > 4 ? `…${e164.slice(-4)}` : "(short)");
  if (intent === "spam" || intent === "wrong_number") {
    return { twilioAction: "hangup_twiml", targetNumberTail: null };
  }
  if (intent === "urgent_medical") {
    return {
      twilioAction: "dial_priority",
      targetNumberTail: priority ? tail(priority) : null,
    };
  }
  return { twilioAction: "dial_ring", targetNumberTail: ring ? tail(ring) : null };
}

const TWIML_TRANSFER_FAIL_SAY_HANGUP = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We're sorry, we could not connect you to a team member right now. Please try again soon.</Say>
  <Hangup/>
</Response>`.trim();

function dialTwiml(input: {
  closing: string;
  numberE164: string;
  callerId: string;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${esc(input.closing)}</Say>
  <Dial timeout="30" callerId="${esc(input.callerId)}">
    <Number>${esc(input.numberE164)}</Number>
  </Dial>
</Response>`.trim();
}

async function postBridgeTranscript(input: {
  externalCallId: string;
  text: string;
  /** caller = PSTN remote; staff = browser mic (Client leg inbound); agent = model TTS text */
  speaker?: "caller" | "agent" | "staff" | "unknown";
}): Promise<void> {
  const baseRaw = process.env.APP_PUBLIC_BASE_URL?.trim();
  const secret = process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim();
  if (!baseRaw || !secret) {
    return;
  }
  const base = baseRaw.replace(/\/$/, "");
  const url = `${base}/api/twilio/voice/bridge-transcript`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Realtime-Bridge-Secret": secret,
    },
    body: JSON.stringify({
      external_call_id: input.externalCallId,
      text: input.text,
      speaker: input.speaker ?? "caller",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn("[realtime-bridge] bridge-transcript POST failed", res.status, t.slice(0, 200));
  } else {
    console.log("[realtime-bridge] bridge_transcript_chunk_posted_ok", {
      callSid: input.externalCallId.slice(0, 10) + "…",
      speaker: input.speaker ?? "caller",
      textLen: input.text.length,
    });
  }
}

async function postSessionResult(input: {
  externalCallId: string;
  intent: string;
  summary: string;
  transcriptExcerpt?: string;
  callerType?: string;
  callerName?: string;
  patientName?: string;
  callbackNumber?: string;
  urgency?: string;
  handoffRecommended?: boolean;
}): Promise<void> {
  const baseRaw = process.env.APP_PUBLIC_BASE_URL?.trim();
  const secret = process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim();
  if (!baseRaw || !secret) {
    console.error(
      "[realtime-bridge] postSessionResult skipped: missing APP_PUBLIC_BASE_URL or REALTIME_BRIDGE_SHARED_SECRET"
    );
    return;
  }
  const base = baseRaw.replace(/\/$/, "");
  const url = `${base}/api/twilio/voice/realtime/result`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Realtime-Bridge-Secret": secret,
    },
    body: JSON.stringify({
      external_call_id: input.externalCallId,
      intent: input.intent,
      summary: input.summary,
      transcript_excerpt: input.transcriptExcerpt,
      caller_type: input.callerType,
      caller_name: input.callerName,
      patient_name: input.patientName,
      callback_number: input.callbackNumber,
      urgency: input.urgency,
      handoff_recommended: input.handoffRecommended,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn("[realtime-bridge] result POST failed", res.status, t.slice(0, 200));
  }
}

/** PSTN-only fallback when {@link applyCallTransferViaApp} fails or APP_PUBLIC_BASE_URL is unset. */
async function applyTwilioRouteLocal(input: {
  callSid: string;
  intent: string;
  summary: string;
  callerId: string;
}): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const ring = process.env.TWILIO_VOICE_RING_E164?.trim();
  if (!sid || !token || !ring) {
    console.error(
      "[realtime-bridge] applyTwilioRoute skipped: missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_VOICE_RING_E164"
    );
    return;
  }
  const priority = process.env.TWILIO_VOICE_PRIORITY_E164?.trim() || ring;
  const client = twilio(sid, token);

  let twiml: string;
  if (input.intent === "spam" || input.intent === "wrong_number") {
    twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
  } else if (input.intent === "urgent_medical") {
    if (isPstnHandoffAiLoopRisk(priority, input.callerId)) {
      console.error("[realtime-bridge] applyTwilioRouteLocal BLOCKED: priority PSTN is AI inbound number (loop)", {
        intent: input.intent,
        inboundToLast4: input.callerId.replace(/\D/g, "").slice(-4),
      });
      twiml = TWIML_TRANSFER_FAIL_SAY_HANGUP;
    } else {
      twiml = dialTwiml({
        closing: "Connecting you right away.",
        numberE164: priority,
        callerId: input.callerId,
      });
    }
  } else {
    if (isPstnHandoffAiLoopRisk(ring, input.callerId)) {
      console.error("[realtime-bridge] applyTwilioRouteLocal BLOCKED: TWILIO_VOICE_RING_E164 is AI inbound number (loop)", {
        intent: input.intent,
        inboundToLast4: input.callerId.replace(/\D/g, "").slice(-4),
      });
      twiml = TWIML_TRANSFER_FAIL_SAY_HANGUP;
    } else {
      twiml = dialTwiml({
        closing: "Connecting you to our team now.",
        numberE164: ring,
        callerId: input.callerId,
      });
    }
  }

  await client.calls(input.callSid).update({ twiml });
  console.log("[realtime-bridge] calls.update (local PSTN)", {
    callSid: input.callSid.slice(0, 10) + "…",
    intent: input.intent,
    usedLoopSafeFailTwiml: twiml === TWIML_TRANSFER_FAIL_SAY_HANGUP,
  });
}

/**
 * Preferred path: Next.js builds TwiML (browser &lt;Client&gt; + PSTN same as main inbound handoff) and runs calls.update.
 */
async function applyCallTransferViaApp(input: {
  callSid: string;
  intent: string;
  callerId: string;
}): Promise<boolean> {
  const baseRaw = process.env.APP_PUBLIC_BASE_URL?.trim();
  const secret = process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim();
  if (!baseRaw || !secret) {
    console.warn(
      "[realtime-bridge] apply-transfer skipped: missing APP_PUBLIC_BASE_URL or REALTIME_BRIDGE_SHARED_SECRET — using local PSTN TwiML"
    );
    return false;
  }
  const base = baseRaw.replace(/\/$/, "");
  const url = `${base}/api/twilio/voice/realtime/apply-transfer`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Realtime-Bridge-Secret": secret,
      },
      body: JSON.stringify({
        call_sid: input.callSid,
        intent: input.intent,
        caller_id: input.callerId,
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      console.warn("[realtime-bridge][transfer] apply-transfer HTTP error", {
        status: res.status,
        bodyPreview: bodyText.slice(0, 500),
      });
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[realtime-bridge][transfer] apply-transfer fetch error", e);
    return false;
  }
}

function connectOpenAi(): WebSocket | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    console.error("[realtime-bridge] connectOpenAi: OPENAI_API_KEY missing — cannot connect to OpenAI");
    return null;
  }
  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`;
  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });
  return ws;
}

function truncateForLog(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… (truncated, total ${s.length} chars)`;
}

/** Safe copy of session.update for logs (instructions/tools shortened; no secrets in payload). */
function sessionUpdatePayloadForLog(msg: Record<string, unknown>): Record<string, unknown> {
  const out = { ...msg };
  const session = out.session;
  if (session && typeof session === "object") {
    const s = { ...(session as Record<string, unknown>) };
    if (typeof s.instructions === "string") {
      s.instructions = truncateForLog(s.instructions, 400);
    }
    if (Array.isArray(s.tools)) {
      s.tools = `[${s.tools.length} tool(s) — omitted from log]`;
    }
    out.session = s;
  }
  return out;
}

/**
 * Every OpenAI-bound JSON frame: log immediately before `send`.
 * Audio append payloads log length only.
 */
function sendOpenAiJson(oai: WebSocket, msg: Record<string, unknown>): void {
  const t = typeof msg.type === "string" ? msg.type : "(missing type)";
  if (t === "input_audio_buffer.append" && !REALTIME_BRIDGE_VERBOSE_AUDIO_LOG) {
    oai.send(JSON.stringify(msg));
    return;
  }
  let payloadForLog: unknown = msg;
  if (t === "input_audio_buffer.append" && typeof msg.audio === "string") {
    payloadForLog = { type: t, audio: `[base64 length=${msg.audio.length}]` };
  } else if (t === "session.update") {
    payloadForLog = sessionUpdatePayloadForLog(msg);
  }
  console.log("[realtime-bridge] openai→outbound", { type: t, payload: payloadForLog });
  oai.send(JSON.stringify(msg));
}

function buildSessionUpdateMessage(opts?: { softphoneTranscriptOnly?: boolean }): Record<string, unknown> {
  const silenceMs = Number.parseInt(process.env.OPENAI_REALTIME_SILENCE_DURATION_MS || "550", 10);
  const silenceDurationMs =
    Number.isFinite(silenceMs) ? Math.min(1200, Math.max(250, silenceMs)) : 550;
  const thresholdRaw = process.env.OPENAI_REALTIME_VAD_THRESHOLD;
  const threshold =
    thresholdRaw != null && thresholdRaw.trim() !== ""
      ? Math.min(0.95, Math.max(0.2, Number.parseFloat(thresholdRaw)))
      : 0.58;
  if (opts?.softphoneTranscriptOnly) {
    return {
      type: "session.update",
      session: {
        modalities: ["text"],
        instructions:
          "Transcribe incoming audio only. Do not produce spoken audio, tool calls, or conversational assistant replies.",
        input_audio_format: "g711_ulaw",
        turn_detection: {
          type: "server_vad",
          threshold,
          prefix_padding_ms: 280,
          silence_duration_ms: silenceDurationMs,
        },
        input_audio_transcription: {
          model: "whisper-1",
        },
        tools: [],
        tool_choice: "none",
      },
    };
  }
  return {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: VOICE_AI_REALTIME_INSTRUCTIONS,
      voice: "alloy",
      input_audio_format: "g711_ulaw",
      output_audio_format: "g711_ulaw",
      turn_detection: {
        type: "server_vad",
        threshold,
        prefix_padding_ms: 280,
        silence_duration_ms: silenceDurationMs,
      },
      input_audio_transcription: {
        model: "whisper-1",
      },
      tools: VOICE_AI_REALTIME_TOOLS,
      tool_choice: "auto",
    },
  };
}

function sendSessionUpdate(oai: WebSocket, opts?: { softphoneTranscriptOnly?: boolean }): void {
  sendOpenAiJson(oai, buildSessionUpdateMessage(opts));
}

function logOpenAiInboundLifecycle(
  ev: Record<string, unknown>,
  opts: { logAudioDelta: () => void }
): void {
  const type = typeof ev.type === "string" ? ev.type : "";
  switch (type) {
    case "session.created":
    case "session.updated":
    case "response.created":
    case "response.output_item.added":
    case "response.audio.done":
    case "response.done":
      console.log(`[realtime-bridge][oai-lifecycle] ${type}`, JSON.stringify(ev).slice(0, 3500));
      break;
    case "response.audio.delta":
      opts.logAudioDelta();
      break;
    case "input_audio_buffer.speech_started":
    case "input_audio_buffer.speech_stopped":
      console.log(`[realtime-bridge][oai-lifecycle] ${type}`);
      break;
    case "error":
      console.error("[realtime-bridge][oai-lifecycle] error", JSON.stringify(ev).slice(0, 3500));
      break;
    default:
      break;
  }
}

/**
 * Raw `http.createServer` only — no Express/Next. Twilio Media Streams use HTTP Upgrade on this
 * process; `server.on("upgrade")` must run here or connections never reach `ws`.
 */
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Twilio OpenAI Realtime bridge — use WebSocket upgrade\n");
});

server.on("error", (err) => {
  console.error("[realtime-bridge] HTTP server error event:", err);
});

const wss = new WebSocketServer({ noServer: true });

function socketRemoteAddress(socket: unknown): string | undefined {
  if (
    socket &&
    typeof socket === "object" &&
    "remoteAddress" in socket &&
    typeof (socket as { remoteAddress: unknown }).remoteAddress === "string"
  ) {
    return (socket as { remoteAddress: string }).remoteAddress;
  }
  return undefined;
}

function normalizeWsPath(pathname: string): string {
  const p = pathname.trim();
  if (!p || p === "/") return "/";
  return p.replace(/\/+$/, "") || "/";
}

function wsPathFromRequest(req: http.IncomingMessage): string {
  try {
    const host = req.headers.host || "localhost";
    return new URL(req.url || "/", `http://${host}`).pathname;
  } catch {
    return req.url || "";
  }
}

/** Softphone transcript streams append these query params (see `appendSoftphoneTranscriptStreamParams`). */
function parseTranscriptWsQuery(req: http.IncomingMessage): {
  transcriptExternalId: string | null;
  inputRole: "staff" | "caller" | null;
  softphoneTranscript: boolean;
} {
  try {
    const host = req.headers.host || "localhost";
    const u = new URL(req.url || "/", `http://${host}`);
    const tid = u.searchParams.get("transcript_external_id")?.trim();
    const role = u.searchParams.get("input_role")?.trim().toLowerCase();
    const inputRole = role === "staff" || role === "caller" ? role : null;
    const softphone =
      u.searchParams.get("softphone_transcript") === "1" || u.searchParams.get("softphone_transcript") === "true";
    return {
      transcriptExternalId: tid && tid.startsWith("CA") ? tid : null,
      inputRole,
      softphoneTranscript: softphone,
    };
  } catch {
    return { transcriptExternalId: null, inputRole: null, softphoneTranscript: false };
  }
}

wss.on("connection", (twilioWs, req) => {
  const transcriptQuery = parseTranscriptWsQuery(req);
  const transcriptExternalIdParam = transcriptQuery.transcriptExternalId;
  const inputTranscriptRoleParam = transcriptQuery.inputRole;
  const softphoneTranscriptMode = transcriptQuery.softphoneTranscript;

  const reqPath = wsPathFromRequest(req);
  console.log("[realtime-bridge][diag] twilio_websocket_client_connected", {
    path: reqPath,
    remoteAddress: req.socket.remoteAddress,
    transcriptExternalIdParam: transcriptExternalIdParam ? transcriptExternalIdParam.slice(0, 12) + "…" : null,
    inputRole: inputTranscriptRoleParam,
    softphoneTranscriptMode,
  });

  let streamSid: string | null = null;
  let callSid: string | null = null;
  /** Row key for `/bridge-transcript` — Client CallSid when present, else Twilio stream CallSid. */
  let bridgeExternalCallIdForTranscript: string | null = null;
  let callerIdForDial = "";
  /** Inbound caller (Stream Parameter `from` / Twilio {{From}}). */
  let callerFromStream = "";
  /** Dialed Twilio number (Stream Parameter `to` / Twilio {{To}}). */
  let streamToFromTwilio = "";
  let oai: WebSocket | null = null;
  let routed = false;
  let firstTwilioMediaLogged = false;
  /** Set on Twilio `start`; used for latency marks from stream start. */
  let latRef: { t0: number; wallMs: number; ms: Record<string, number> } | null = null;
  let firstOaiAudioDeltaLogged = false;
  let firstTwilioOutboundMediaLogged = false;
  /** Accumulates `response.*audio_transcript.delta` until done (assistant side). */
  let agentTranscriptBuffer = "";
  /** Twilio `media.track` sample counts (inbound vs outbound) for diagnosing mixed streams. */
  let mediaChunksByTrack: Record<string, number> = {};
  let mediaTrackDiagLogged = false;

  const safeClose = () => {
    try {
      twilioWs.close();
    } catch {
      /* ignore */
    }
    try {
      oai?.close();
    } catch {
      /* ignore */
    }
  };

  twilioWs.on("message", (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw)) as Record<string, unknown>;
    } catch {
      return;
    }

    const event = typeof msg.event === "string" ? msg.event : "";

    if (event === "connected") {
      console.log("[realtime-bridge][diag] twilio_connected_event", {
        streamSid: typeof msg.streamSid === "string" ? msg.streamSid : null,
      });
      return;
    }

    if (event === "start") {
      const start = msg.start as Record<string, unknown> | undefined;
      streamSid = typeof msg.streamSid === "string" ? msg.streamSid : null;
      callSid = start && typeof start.callSid === "string" ? start.callSid : null;
      const custom =
        start && start.customParameters && typeof start.customParameters === "object"
          ? (start.customParameters as Record<string, unknown>)
          : {};
      /** Twilio passes &lt;Parameter&gt; values on the Stream start message. */
      const to = typeof custom.to === "string" ? custom.to : "";
      streamToFromTwilio = to.trim();
      const fromParam = typeof custom.from === "string" ? custom.from : "";
      callerFromStream = fromParam.trim() || "";
      /**
       * PSTN caller for transfer `callerId` / child-leg CLI must be stream `from` ({{From}}), not `to` ({{To}}).
       * `to` is the dialed Twilio DID — using it made browser Client `From` show junk (e.g. last digits like "86").
       */
      callerIdForDial = callerFromStream || streamToFromTwilio || "";

      if (!callSid) {
        console.error("[realtime-bridge] missing callSid on start");
        safeClose();
        return;
      }

      bridgeExternalCallIdForTranscript = transcriptExternalIdParam ?? callSid;

      console.log("[realtime-bridge][diag] twilio_start_event_received", {
        streamSid,
        callSid: callSid.slice(0, 12) + "…",
        mediaFormat: start && start.mediaFormat,
        streamFromParameter: callerFromStream || null,
        streamToParameter: streamToFromTwilio || null,
        callerIdUsedForTransfer: callerIdForDial || null,
      });

      console.log("[realtime-bridge][diag] transcript_stream_context", {
        twilioMediaCallSid: callSid.slice(0, 12) + "…",
        transcriptExternalId: bridgeExternalCallIdForTranscript.slice(0, 12) + "…",
        inputRole: inputTranscriptRoleParam,
        softphoneTranscriptMode,
        note:
          inputTranscriptRoleParam === "staff"
            ? "Whisper input ≈ browser mic (Client leg inbound)"
            : inputTranscriptRoleParam === "caller"
              ? "Whisper input ≈ PSTN toward Twilio (PSTN leg inbound)"
              : "legacy stream — input speaker defaults to caller",
      });

      latRef = {
        t0: performance.now(),
        wallMs: Date.now(),
        ms: {},
      };
      const markLatency = (name: string) => {
        if (!latRef || latRef.ms[name] !== undefined) return;
        latRef.ms[name] = Math.round(performance.now() - latRef.t0);
      };
      markLatency("twilio_stream_start");

      oai = connectOpenAi();
      if (!oai) {
        console.error("[realtime-bridge] aborting stream session: OpenAI client not created (check OPENAI_API_KEY)");
        safeClose();
        return;
      }
      oai.on("open", () => {
        markLatency("oai_ws_open");
        console.log("[realtime-bridge][diag] openai_realtime_session_ws_open", {
          callSid: callSid!.slice(0, 12) + "…",
          streamSid,
          model: MODEL,
        });
        console.log("[realtime-bridge][oai] voice_turn_policy", {
          turn_detection: "server_vad+tuned",
          REALTIME_DIAG_RESPONSE_CREATE_ON_CONNECT,
          softphoneTranscriptMode,
          env: {
            OPENAI_REALTIME_SILENCE_DURATION_MS: process.env.OPENAI_REALTIME_SILENCE_DURATION_MS ?? "(default 400)",
            OPENAI_REALTIME_VAD_THRESHOLD: process.env.OPENAI_REALTIME_VAD_THRESHOLD ?? "(default 0.42)",
          },
        });
        sendSessionUpdate(oai!, { softphoneTranscriptOnly: softphoneTranscriptMode });
        markLatency("session_update_sent");
        if (!softphoneTranscriptMode && REALTIME_DIAG_RESPONSE_CREATE_ON_CONNECT) {
          sendOpenAiJson(oai!, {
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
              instructions:
                "Say one brief sentence: you are Saintly Home Health's assistant, then ask how you can help. Under 8 seconds.",
            },
          });
          markLatency("response_create_sent");
        } else if (softphoneTranscriptMode) {
          console.log("[realtime-bridge][diag] softphone_transcript_skip_initial_response_create", {
            callSid: callSid!.slice(0, 12) + "…",
          });
        }
      });

      oai.on("message", async (data) => {
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(String(data)) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = typeof ev.type === "string" ? ev.type : "";

        if (type === "input_audio_buffer.speech_started") {
          markLatency("vad_speech_started");
        }
        if (type === "input_audio_buffer.speech_stopped") {
          markLatency("vad_speech_stopped");
        }
        if (type === "response.created") {
          markLatency("first_response_created");
        }

        const logAudioDelta = () => {
          if (REALTIME_BRIDGE_VERBOSE_AUDIO_LOG) {
            console.log("[realtime-bridge][oai-lifecycle] response.audio.delta", {
              deltaBase64Length: typeof ev.delta === "string" ? ev.delta.length : 0,
            });
          } else if (!firstOaiAudioDeltaLogged) {
            firstOaiAudioDeltaLogged = true;
            markLatency("first_oai_audio_delta");
            const m = latRef?.ms;
            if (m && latRef) {
              console.log("[realtime-bridge][latency-ms]", {
                wallClockStart: latRef.wallMs,
                marks: m,
                delta_first_twilio_in_to_response_create:
                  m.response_create_sent != null && m.first_twilio_inbound_media != null
                    ? m.response_create_sent - m.first_twilio_inbound_media
                    : null,
                delta_response_create_to_first_oai_audio:
                  m.response_create_sent != null && m.first_oai_audio_delta != null
                    ? m.first_oai_audio_delta - m.response_create_sent
                    : null,
                delta_oai_open_to_first_oai_audio:
                  m.oai_ws_open != null && m.first_oai_audio_delta != null
                    ? m.first_oai_audio_delta - m.oai_ws_open
                    : null,
              });
            }
          }
        };

        logOpenAiInboundLifecycle(ev, { logAudioDelta });

        if (type === "conversation.item.input_audio_transcription.completed") {
          const transcript = typeof ev.transcript === "string" ? ev.transcript.trim() : "";
          const extId = bridgeExternalCallIdForTranscript ?? callSid;
          const inputSpeaker: "staff" | "caller" =
            inputTranscriptRoleParam === "staff"
              ? "staff"
              : inputTranscriptRoleParam === "caller"
                ? "caller"
                : "caller";
          if (transcript && extId) {
            console.log("[realtime-bridge] transcript_delta_received", {
              kind: "input_utterance_whisper_complete",
              callSid: callSid?.slice(0, 10) + "…",
              transcriptExternalId: extId.slice(0, 10) + "…",
              speakerLabelBeforeStore: inputSpeaker,
              softphoneTranscriptMode,
              len: transcript.length,
            });
            void postBridgeTranscript({ externalCallId: extId, text: transcript, speaker: inputSpeaker });
          }
          return;
        }

        if (
          type === "response.audio_transcript.delta" ||
          type === "response.output_audio_transcript.delta"
        ) {
          const delta = typeof ev.delta === "string" ? ev.delta : "";
          agentTranscriptBuffer += delta;
          if (delta) {
            console.log("[realtime-bridge] transcript_delta_received", {
              kind: "assistant_delta",
              type,
              deltaLen: delta.length,
              callSid: callSid ? callSid.slice(0, 10) + "…" : null,
            });
          }
          return;
        }

        if (type === "response.audio_transcript.done" || type === "response.output_audio_transcript.done") {
          const text = agentTranscriptBuffer.trim();
          agentTranscriptBuffer = "";
          const extId = bridgeExternalCallIdForTranscript ?? callSid;
          if (text && extId) {
            if (softphoneTranscriptMode) {
              console.log("[realtime-bridge] bridge_transcript_agent_skipped_softphone_transcribe_only", {
                len: text.length,
                callSid: callSid?.slice(0, 10) + "…",
              });
              return;
            }
            console.log("[realtime-bridge] transcript_delta_received", {
              kind: "assistant_utterance_done",
              len: text.length,
              callSid: callSid?.slice(0, 10) + "…",
            });
            void postBridgeTranscript({ externalCallId: extId, text, speaker: "agent" });
          }
          return;
        }

        if (type === "response.audio.delta") {
          const delta = typeof ev.delta === "string" ? ev.delta : "";
          if (delta && streamSid && twilioWs.readyState === WebSocket.OPEN) {
            if (!firstTwilioOutboundMediaLogged) {
              firstTwilioOutboundMediaLogged = true;
              markLatency("first_twilio_outbound_media");
            }
            const out = {
              event: "media",
              streamSid,
              media: { track: "outbound", payload: delta },
            };
            twilioWs.send(JSON.stringify(out));
          }
          return;
        }

        if (type === "response.function_call_arguments.done") {
          const name = typeof ev.name === "string" ? ev.name : "";
          const argsRaw = typeof ev.arguments === "string" ? ev.arguments : "";
          if (name !== "route_call" || routed) return;
          routed = true;
          let args: {
            intent?: string;
            summary?: string;
            closing_message?: string;
            caller_type?: string;
            caller_name?: string;
            patient_name?: string;
            callback_number?: string;
            urgency?: string;
            handoff_recommended?: boolean;
          };
          try {
            args = JSON.parse(argsRaw) as typeof args;
          } catch {
            routed = false;
            return;
          }
          const intent = (args.intent ?? "").trim();
          const summary = (args.summary ?? "").trim() || "Realtime session routed.";
          const transcriptExcerpt = summary.slice(0, 500);

          if (callSid) {
            if (!REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER && !callerIdForDial) {
              const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
              const tok = process.env.TWILIO_AUTH_TOKEN?.trim();
              if (sid && tok) {
                try {
                  const client = twilio(sid, tok);
                  const call = await client.calls(callSid).fetch();
                  /** Inbound parent: `from` is the PSTN caller; `to` is your Twilio number. */
                  callerIdForDial = call.from || call.to || "";
                } catch (e) {
                  console.warn("[realtime-bridge] fetch call for callerId:", e);
                }
              } else {
                console.warn(
                  "[realtime-bridge] skip fetch call for callerId: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing"
                );
              }
            }

            void postSessionResult({
              externalCallId: callSid,
              intent,
              summary,
              transcriptExcerpt,
              callerType: typeof args.caller_type === "string" ? args.caller_type : undefined,
              callerName: typeof args.caller_name === "string" ? args.caller_name : undefined,
              patientName: typeof args.patient_name === "string" ? args.patient_name : undefined,
              callbackNumber: typeof args.callback_number === "string" ? args.callback_number : undefined,
              urgency: typeof args.urgency === "string" ? args.urgency : undefined,
              handoffRecommended:
                typeof args.handoff_recommended === "boolean" ? args.handoff_recommended : undefined,
            });

            const dialCallerId =
              callerIdForDial || process.env.TWILIO_VOICE_RING_E164?.trim() || "";
            const wouldBe = describeWouldBeTransfer(intent);

            if (REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER) {
              console.log("[realtime-bridge][isolation] route_call_requested_transfer_SUPPRESSED", {
                callSid: callSid.slice(0, 12) + "…",
                callerFromStreamParameter: callerFromStream || null,
                streamToParameter: streamToFromTwilio || null,
                intent,
                summaryPreview: summary.slice(0, 400),
                wouldBeTwilioAction: wouldBe.twilioAction,
                wouldBeTargetNumberTail: wouldBe.targetNumberTail,
                outboundCallerIdThatWouldBeUsedTail: dialCallerId
                  ? dialCallerId.length > 4
                    ? `…${dialCallerId.slice(-4)}`
                    : dialCallerId
                  : null,
                note: "transfer suppressed; sockets stay open",
              });
            } else {
              if (!dialCallerId) {
                console.error(
                  "[realtime-bridge] transfer skipped: no callerId and TWILIO_VOICE_RING_E164 missing"
                );
              } else {
                void (async () => {
                  const ok = await applyCallTransferViaApp({
                    callSid,
                    intent,
                    callerId: dialCallerId,
                  });
                  if (!ok) {
                    await applyTwilioRouteLocal({
                      callSid,
                      intent,
                      summary,
                      callerId: dialCallerId,
                    });
                  }
                  setTimeout(safeClose, 500);
                })().catch((e) => console.error("[realtime-bridge] transfer chain", e));
              }
            }
          }

          return;
        }
      });

      oai.on("error", (err) => {
        console.error("[realtime-bridge][diag] openai_websocket_error", err);
      });

      oai.on("close", (code, reason) => {
        console.log("[realtime-bridge][diag] openai_websocket_closed", {
          code,
          reason: String(reason),
          callSid: callSid?.slice(0, 12) + "…",
          streamSid,
        });
        if (twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.close();
        }
      });

      return;
    }

    if (event === "media") {
      const media = msg.media as Record<string, unknown> | undefined;
      const track = media && typeof media.track === "string" ? media.track : "unknown";
      mediaChunksByTrack[track] = (mediaChunksByTrack[track] ?? 0) + 1;
      if (!mediaTrackDiagLogged) {
        const total = Object.values(mediaChunksByTrack).reduce((a, b) => a + b, 0);
        if (total >= 24) {
          mediaTrackDiagLogged = true;
          console.log("[realtime-bridge][diag] twilio_media_track_sample", {
            streamSid,
            callSid: callSid ? callSid.slice(0, 12) + "…" : null,
            chunksByTrack: { ...mediaChunksByTrack },
            softphoneTranscriptMode,
            inputTranscriptRole: inputTranscriptRoleParam,
          });
        }
      }
      if (!firstTwilioMediaLogged) {
        firstTwilioMediaLogged = true;
        if (latRef) {
          if (latRef.ms.first_twilio_inbound_media === undefined) {
            latRef.ms.first_twilio_inbound_media = Math.round(performance.now() - latRef.t0);
          }
        }
        console.log("[realtime-bridge][diag] twilio_first_media_event_received", {
          streamSid,
          callSid: callSid ? callSid.slice(0, 12) + "…" : null,
          track,
          oaiReady: Boolean(oai && oai.readyState === WebSocket.OPEN),
          msSinceStreamStart: latRef?.ms.first_twilio_inbound_media,
        });
      }
    }

    if (event === "media" && oai && oai.readyState === WebSocket.OPEN) {
      const media = msg.media as Record<string, unknown> | undefined;
      const payload = media && typeof media.payload === "string" ? media.payload : "";
      if (!payload) return;
      sendOpenAiJson(oai, {
        type: "input_audio_buffer.append",
        audio: payload,
      });
      return;
    }

    if (event === "stop") {
      safeClose();
    }
  });

  twilioWs.on("close", (code, reason) => {
    console.log("[realtime-bridge][diag] twilio_websocket_closed", {
      code,
      reason: String(reason),
      callSid: callSid ? callSid.slice(0, 12) + "…" : null,
      streamSid,
    });
    oai?.close();
  });

  twilioWs.on("error", (err) => {
    console.error("[realtime-bridge][diag] twilio_websocket_error", err);
    oai?.close();
  });
});

server.on("upgrade", (request, socket, head) => {
  const rawUrl = request.url ?? "";

  console.log("[realtime-bridge] http_upgrade_received", {
    method: request.method,
    rawUrl,
    upgrade: request.headers.upgrade,
    connection: request.headers.connection,
    remoteAddress: socketRemoteAddress(socket),
  });

  const upgradeHdr = String(request.headers.upgrade || "").toLowerCase();
  if (upgradeHdr !== "websocket") {
    console.warn("[realtime-bridge] http_upgrade_rejected", {
      reason: "upgrade_header_not_websocket",
      upgrade: request.headers.upgrade,
      rawUrl,
    });
    socket.destroy();
    return;
  }

  let pathname = "";
  try {
    const host = request.headers.host || "localhost";
    pathname = new URL(rawUrl || "/", `http://${host}`).pathname;
  } catch (e) {
    console.warn("[realtime-bridge] http_upgrade_rejected", {
      reason: "url_parse_error",
      rawUrl,
      error: e instanceof Error ? e.message : String(e),
    });
    socket.destroy();
    return;
  }

  const expectedNorm = normalizeWsPath(WS_PATH);
  const gotNorm = normalizeWsPath(pathname);

  console.log("[realtime-bridge] http_upgrade_path", {
    pathname,
    pathnameNormalized: gotNorm,
    expectedPath: WS_PATH,
    expectedNormalized: expectedNorm,
    rawUrl,
  });

  if (gotNorm !== expectedNorm) {
    console.warn("[realtime-bridge] http_upgrade_rejected", {
      reason: "path_mismatch_not_twilio_stream",
      pathname,
      pathnameNormalized: gotNorm,
      expectedPath: WS_PATH,
      expectedNormalized: expectedNorm,
      rawUrl,
    });
    socket.destroy();
    return;
  }

  try {
    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log("[realtime-bridge] upgrade_accepted_for_twilio_stream", {
        pathname,
        rawUrl,
        remoteAddress: socketRemoteAddress(socket),
      });
      wss.emit("connection", ws, request);
    });
  } catch (err) {
    console.error("[realtime-bridge] http_upgrade_rejected", {
      reason: "handleUpgrade_threw",
      rawUrl,
      pathname,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }
});

process.on("uncaughtException", (err, origin) => {
  console.error("[realtime-bridge] uncaughtException", {
    origin,
    message: err?.message,
    stack: err?.stack ?? String(err),
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("[realtime-bridge] unhandledRejection", reason);
  if (reason instanceof Error && reason.stack) {
    console.error("[realtime-bridge] unhandledRejection stack", reason.stack);
  }
});

function boot(): void {
  try {
    logStartupEnvAudit();
  } catch (e) {
    console.error("[realtime-bridge] logStartupEnvAudit error (non-fatal):", e);
    if (e instanceof Error && e.stack) {
      console.error(e.stack);
    }
  }
  startHeartbeat();
  server.listen(PORT, "0.0.0.0", () => {
    console.log("[realtime-bridge] bridge boot complete");
    console.log("[realtime-bridge] REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER", {
      active: REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER,
      hint: 'When true: no transfer after route_call. Set env "false" or omit for normal AI→human redirect.',
    });
    console.log(
      `[realtime-bridge] listening http://0.0.0.0:${PORT} | ws path ${WS_PATH} | model=${MODEL} | TwiML → wss://<public-host>${WS_PATH}`
    );
  });
}

try {
  boot();
} catch (e) {
  console.error("[realtime-bridge] top-level boot() threw (this is rare):", e);
  if (e instanceof Error && e.stack) {
    console.error(e.stack);
  }
}
