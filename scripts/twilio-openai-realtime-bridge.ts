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
 */

import * as http from "node:http";
import { URL } from "node:url";

import twilio from "twilio";
import { WebSocket, WebSocketServer } from "ws";

import {
  VOICE_AI_REALTIME_INSTRUCTIONS,
  VOICE_AI_REALTIME_TOOLS,
} from "../src/lib/phone/voice-ai-realtime-system-prompt";

const MODEL =
  process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-4o-realtime-preview-2024-12-17";
const PORT = Number.parseInt(process.env.REALTIME_BRIDGE_PORT || "8080", 10) || 8080;
const WS_PATH = process.env.REALTIME_WS_PATH?.trim() || "/twilio/realtime-stream";

const HEARTBEAT_MS = Number.parseInt(process.env.REALTIME_BRIDGE_HEARTBEAT_MS || "12000", 10) || 12000;

/** TODO(isolation): set to false after diagnostics — restores applyTwilioRoute + post-route_call socket close. */
const FORCE_DIAG_SUPPRESS_TRANSFER = true;

const _suppressTransferEnv = process.env.REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER?.trim();
/** Env "false" overrides FORCE (restore transfers without code change). */
const REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER =
  _suppressTransferEnv === "false"
    ? false
    : FORCE_DIAG_SUPPRESS_TRANSFER || _suppressTransferEnv === "true";

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

async function applyTwilioRoute(input: {
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
    twiml = dialTwiml({
      closing: "Connecting you right away.",
      numberE164: priority,
      callerId: input.callerId,
    });
  } else {
    twiml = dialTwiml({
      closing: "Connecting you to our team now.",
      numberE164: ring,
      callerId: input.callerId,
    });
  }

  await client.calls(input.callSid).update({ twiml });
  console.log("[realtime-bridge] calls.update", { callSid: input.callSid.slice(0, 10) + "…", intent: input.intent });
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

function sendSessionUpdate(oai: WebSocket): void {
  const msg = {
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: VOICE_AI_REALTIME_INSTRUCTIONS,
      voice: "alloy",
      input_audio_format: "g711_ulaw",
      output_audio_format: "g711_ulaw",
      turn_detection: { type: "server_vad" },
      tools: VOICE_AI_REALTIME_TOOLS,
      tool_choice: "auto",
    },
  };
  oai.send(JSON.stringify(msg));
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Twilio OpenAI Realtime bridge — use WebSocket upgrade\n");
});

server.on("error", (err) => {
  console.error("[realtime-bridge] HTTP server error event:", err);
});

const wss = new WebSocketServer({ noServer: true });

function wsPathFromRequest(req: http.IncomingMessage): string {
  try {
    const host = req.headers.host || "localhost";
    return new URL(req.url || "/", `http://${host}`).pathname;
  } catch {
    return req.url || "";
  }
}

wss.on("connection", (twilioWs, req) => {
  const reqPath = wsPathFromRequest(req);
  console.log("[realtime-bridge][diag] twilio_websocket_client_connected", {
    path: reqPath,
    remoteAddress: req.socket.remoteAddress,
  });

  let streamSid: string | null = null;
  let callSid: string | null = null;
  let callerIdForDial = "";
  /** Inbound caller (Stream Parameter `from` / Twilio {{From}}). */
  let callerFromStream = "";
  let oai: WebSocket | null = null;
  let routed = false;
  let firstTwilioMediaLogged = false;

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
      callerIdForDial = to.trim() || "";
      const fromParam = typeof custom.from === "string" ? custom.from : "";
      callerFromStream = fromParam.trim() || "";

      if (!callSid) {
        console.error("[realtime-bridge] missing callSid on start");
        safeClose();
        return;
      }

      console.log("[realtime-bridge][diag] twilio_start_event_received", {
        streamSid,
        callSid: callSid.slice(0, 12) + "…",
        mediaFormat: start && start.mediaFormat,
        callerFromStreamParam: callerFromStream || null,
        dialedToStreamParam: callerIdForDial || null,
      });

      oai = connectOpenAi();
      if (!oai) {
        console.error("[realtime-bridge] aborting stream session: OpenAI client not created (check OPENAI_API_KEY)");
        safeClose();
        return;
      }
      oai.on("open", () => {
        console.log("[realtime-bridge][diag] openai_realtime_session_ws_open", {
          callSid: callSid!.slice(0, 12) + "…",
          streamSid,
          model: MODEL,
        });
        sendSessionUpdate(oai!);
      });

      oai.on("message", async (data) => {
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(String(data)) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = typeof ev.type === "string" ? ev.type : "";

        if (type === "response.audio.delta") {
          const delta = typeof ev.delta === "string" ? ev.delta : "";
          if (delta && streamSid && twilioWs.readyState === WebSocket.OPEN) {
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
                  callerIdForDial = call.to || call.from || "";
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
                streamToParameter: callerIdForDial || null,
                intent,
                summaryPreview: summary.slice(0, 400),
                wouldBeTwilioAction: wouldBe.twilioAction,
                wouldBeTargetNumberTail: wouldBe.targetNumberTail,
                outboundCallerIdThatWouldBeUsedTail: dialCallerId
                  ? dialCallerId.length > 4
                    ? `…${dialCallerId.slice(-4)}`
                    : dialCallerId
                  : null,
                note: "applyTwilioRoute not called; sockets stay open",
              });
            } else {
              if (!dialCallerId) {
                console.error(
                  "[realtime-bridge] applyTwilioRoute skipped: no callerId and TWILIO_VOICE_RING_E164 missing"
                );
              } else {
                void applyTwilioRoute({
                  callSid,
                  intent,
                  summary,
                  callerId: dialCallerId,
                }).catch((e) => console.error("[realtime-bridge] applyTwilioRoute", e));
              }
              setTimeout(safeClose, 500);
            }
          }

          return;
        }

        if (type === "error") {
          console.error(
            "[realtime-bridge][diag] openai_connection_or_session_error",
            JSON.stringify(ev).slice(0, 800)
          );
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
      if (!firstTwilioMediaLogged) {
        firstTwilioMediaLogged = true;
        const media = msg.media as Record<string, unknown> | undefined;
        const track = media && typeof media.track === "string" ? media.track : undefined;
        console.log("[realtime-bridge][diag] twilio_first_media_event_received", {
          streamSid,
          callSid: callSid ? callSid.slice(0, 12) + "…" : null,
          track,
          oaiReady: Boolean(oai && oai.readyState === WebSocket.OPEN),
        });
      }
    }

    if (event === "media" && oai && oai.readyState === WebSocket.OPEN) {
      const media = msg.media as Record<string, unknown> | undefined;
      const payload = media && typeof media.payload === "string" ? media.payload : "";
      if (!payload) return;
      oai.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: payload,
        })
      );
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
  try {
    const host = request.headers.host || "localhost";
    const u = new URL(request.url || "/", `http://${host}`);
    if (u.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
  } catch {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    console.log("[realtime-bridge][diag] http_upgrade_accepted_for_twilio_stream", {
      path: wsPathFromRequest(request),
    });
    wss.emit("connection", ws, request);
  });
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
    console.log("[realtime-bridge][isolation] REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER", {
      active: REALTIME_BRIDGE_SUPPRESS_ROUTE_TRANSFER,
      hint: "When true: no applyTwilioRoute; streams stay open after route_call. Unset or false = normal transfer.",
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
