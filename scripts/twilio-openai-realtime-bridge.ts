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

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
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
  const base = requireEnv("APP_PUBLIC_BASE_URL").replace(/\/$/, "");
  const secret = requireEnv("REALTIME_BRIDGE_SHARED_SECRET");
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
  const sid = requireEnv("TWILIO_ACCOUNT_SID");
  const token = requireEnv("TWILIO_AUTH_TOKEN");
  const ring = requireEnv("TWILIO_VOICE_RING_E164");
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

function connectOpenAi(): WebSocket {
  const key = requireEnv("OPENAI_API_KEY");
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

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (twilioWs, req) => {
  let streamSid: string | null = null;
  let callSid: string | null = null;
  let callerIdForDial = "";
  let oai: WebSocket | null = null;
  let routed = false;

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

      if (!callSid) {
        console.error("[realtime-bridge] missing callSid on start");
        safeClose();
        return;
      }

      oai = connectOpenAi();
      oai.on("open", () => {
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
            if (!callerIdForDial) {
              try {
                const client = twilio(requireEnv("TWILIO_ACCOUNT_SID"), requireEnv("TWILIO_AUTH_TOKEN"));
                const call = await client.calls(callSid).fetch();
                callerIdForDial = call.to || call.from || "";
              } catch (e) {
                console.warn("[realtime-bridge] fetch call for callerId:", e);
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

            void applyTwilioRoute({
              callSid,
              intent,
              summary,
              callerId: callerIdForDial || requireEnv("TWILIO_VOICE_RING_E164"),
            }).catch((e) => console.error("[realtime-bridge] applyTwilioRoute", e));
          }

          setTimeout(safeClose, 500);
          return;
        }

        if (type === "error") {
          console.error("[realtime-bridge] OpenAI error:", JSON.stringify(ev).slice(0, 500));
        }
      });

      oai.on("error", (err) => {
        console.error("[realtime-bridge] OpenAI WS error:", err);
      });

      oai.on("close", () => {
        if (twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.close();
        }
      });

      return;
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

  twilioWs.on("close", () => {
    oai?.close();
  });

  twilioWs.on("error", (err) => {
    console.error("[realtime-bridge] Twilio WS error:", err);
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
    wss.emit("connection", ws, request);
  });
});

try {
  requireEnv("OPENAI_API_KEY");
  requireEnv("TWILIO_ACCOUNT_SID");
  requireEnv("TWILIO_AUTH_TOKEN");
  requireEnv("TWILIO_VOICE_RING_E164");
  requireEnv("APP_PUBLIC_BASE_URL");
  requireEnv("REALTIME_BRIDGE_SHARED_SECRET");
} catch (e) {
  console.error("[realtime-bridge] env check failed:", e);
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(
    `[realtime-bridge] listening ws://localhost:${PORT}${WS_PATH} | model=${MODEL} | TwiML Stream URL → wss://<public-host>${WS_PATH}`
  );
});
