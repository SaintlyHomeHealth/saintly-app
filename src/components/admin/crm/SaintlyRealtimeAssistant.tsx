"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { SAINTLY_CRM_VOICE_PHI_NOTICE_DEFAULT } from "@/lib/crm/crm-voice-phi-copy";
import type { SaintlyRealtimeGatewayClientSnapshot } from "@/lib/crm/saintly-ai-voice-config";

export type SaintlyRealtimeAssistantProps = {
  /** Server-evaluated realtime gateway + authoritative session timeouts. */
  gateway: SaintlyRealtimeGatewayClientSnapshot;
  /** From server (`getSaintlyCrmVoicePhiNotice`). Defaults to strict copy if omitted. */
  voicePhiNotice?: string;
  sessionContext: {
    lead_id?: string | null;
    recruit_id?: string | null;
    employee_id?: string | null;
    facility_id?: string | null;
    patient_id?: string | null;
    insurance_payer_id?: string | null;
  };
  className?: string;
};

type Conn = "idle" | "connecting" | "live" | "error";

type SessionEndTelemetryReason = "manual_close" | "max_session_ms" | "inactivity_timeout";

function b64UrlJson(obj: Record<string, string | null | undefined>): string {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.trim()) clean[k] = v.trim();
  }
  const s = JSON.stringify(clean);
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

type ToolCall = { name: string; arguments: string; callId: string };

function parseToolCall(evt: unknown): ToolCall | null {
  if (!evt || typeof evt !== "object") return null;
  const e = evt as Record<string, unknown>;
  if (e.type === "response.output_item.done" && e.item && typeof e.item === "object") {
    const it = e.item as Record<string, unknown>;
    if (
      it.type === "function_call" &&
      typeof it.name === "string" &&
      typeof it.arguments === "string" &&
      typeof it.call_id === "string"
    ) {
      return { name: it.name, arguments: it.arguments, callId: it.call_id };
    }
  }
  if (
    e.type === "response.function_call_arguments.done" &&
    typeof e.name === "string" &&
    typeof e.arguments === "string" &&
    typeof e.call_id === "string"
  ) {
    return { name: e.name, arguments: e.arguments, callId: e.call_id };
  }
  return null;
}

export function SaintlyRealtimeAssistant({
  gateway,
  voicePhiNotice = SAINTLY_CRM_VOICE_PHI_NOTICE_DEFAULT,
  sessionContext,
  className = "",
}: SaintlyRealtimeAssistantProps) {
  const router = useRouter();
  const [conn, setConn] = useState<Conn>("idle");
  const [note, setNote] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const startedAtMs = useRef<number | null>(null);
  const lastEventMs = useRef<number>(Date.now());

  const hdr = useMemo(
    () => ({
      lead_id: sessionContext.lead_id ?? null,
      recruit_id: sessionContext.recruit_id ?? null,
      employee_id: sessionContext.employee_id ?? null,
      facility_id: sessionContext.facility_id ?? null,
      patient_id: sessionContext.patient_id ?? null,
      insurance_payer_id: sessionContext.insurance_payer_id ?? null,
    }),
    [
      sessionContext.employee_id,
      sessionContext.facility_id,
      sessionContext.insurance_payer_id,
      sessionContext.lead_id,
      sessionContext.patient_id,
      sessionContext.recruit_id,
    ]
  );

  const requestHeaders = useMemo(
    () => ({
      "x-saintly-realtime-context": b64UrlJson(hdr),
      "Content-Type": "application/json",
    }),
    [hdr]
  );

  const teardown = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
    }
    startedAtMs.current = null;
  }, []);

  const finishSession = useCallback(
    (reason: SessionEndTelemetryReason) => {
      const started = startedAtMs.current;
      const elapsedSessionMs =
        typeof started === "number" && Number.isFinite(started) ? Date.now() - started : null;
      const idleMs =
        typeof started === "number" && Number.isFinite(started) ? Date.now() - lastEventMs.current : null;

      if (reason !== "manual_close") {
        console.info("[saintly-crm-realtime][browser] session_autoclose", {
          reason,
          elapsed_session_ms: elapsedSessionMs,
          idle_since_last_event_ms: idleMs,
          configured_max_session_ms: gateway.max_session_ms,
          configured_inactivity_ms: gateway.inactivity_ms,
        });
      }

      teardown();
      setConn("idle");
      router.refresh();
    },
    [gateway.inactivity_ms, gateway.max_session_ms, router, teardown]
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      if (conn !== "live") return;
      const started = startedAtMs.current ?? Date.now();
      const elapsed = Date.now() - started;
      if (elapsed > gateway.max_session_ms) {
        finishSession("max_session_ms");
      } else if (Date.now() - lastEventMs.current > gateway.inactivity_ms) {
        finishSession("inactivity_timeout");
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [conn, finishSession, gateway.inactivity_ms, gateway.max_session_ms]);

  const runTool = useCallback(
    async (tool: ToolCall) => {
      const res = await fetch("/api/admin/ai/realtime-tools", {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          tool_name: tool.name,
          arguments: tool.arguments,
          session_context: {
            lead_id: sessionContext.lead_id ?? undefined,
            recruit_id: sessionContext.recruit_id ?? undefined,
            employee_id: sessionContext.employee_id ?? undefined,
            facility_id: sessionContext.facility_id ?? undefined,
            patient_id: sessionContext.patient_id ?? undefined,
            insurance_payer_id: sessionContext.insurance_payer_id ?? undefined,
          },
          realtime_started_at_ms: startedAtMs.current ?? Date.now(),
        }),
      });
      const js = (await res.json().catch(() => ({}))) as { error?: string; output?: string };
      if (!res.ok) {
        const err = typeof js.error === "string" ? js.error : "tool proxy failed";
        return JSON.stringify({ error: err });
      }
      return typeof js.output === "string" ? js.output : JSON.stringify(js);
    },
    [requestHeaders, sessionContext]
  );

  const handleDcMessage = useCallback(
    async (raw: string) => {
      lastEventMs.current = Date.now();
      let evt: unknown;
      try {
        evt = JSON.parse(raw) as unknown;
      } catch {
        return;
      }

      const tool = parseToolCall(evt);
      if (!tool || !dcRef.current || dcRef.current.readyState !== "open") return;

      const output = await runTool(tool);
      const dc = dcRef.current;
      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: tool.callId,
            output,
          },
        })
      );
      dc.send(JSON.stringify({ type: "response.create" }));
      router.refresh();
    },
    [router, runTool]
  );

  const connect = async () => {
    if (typeof window === "undefined" || typeof RTCPeerConnection === "undefined") {
      setConn("error");
      setNote("WebRTC unsupported.");
      return;
    }
    if (!gateway.enabled) {
      setConn("error");
      setNote("Realtime is disabled.");
      return;
    }

    setConn("connecting");
    setNote(null);
    startedAtMs.current = Date.now();
    lastEventMs.current = Date.now();

    const secRes = await fetch("/api/admin/ai/realtime-client-secret", { method: "POST" });
    if (!secRes.ok) {
      setConn("error");
      setNote("Could not authorize realtime session.");
      return;
    }
    const secJson = (await secRes.json()) as { ephemeral_key?: string };
    const ephemeral = typeof secJson.ephemeral_key === "string" ? secJson.ephemeral_key : "";

    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    const audio = document.createElement("audio");
    audio.autoplay = true;
    audioElRef.current = audio;

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (stream) audio.srcObject = stream;
    };

    try {
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const t of ms.getTracks()) pc.addTrack(t);
    } catch (e) {
      console.warn("[SaintlyRealtimeAssistant] mic denied", e);
      setConn("error");
      setNote("Microphone unavailable — grant permission or use a HTTPS session.");
      teardown();
      return;
    }

    const dc = pc.createDataChannel("oai-events");
    dcRef.current = dc;
    dc.onmessage = (m) => {
      void handleDcMessage(String(m.data ?? ""));
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp ?? "",
      headers: {
        Authorization: `Bearer ${ephemeral}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpRes.ok) {
      setConn("error");
      setNote("Could not connect to OpenAI Realtime.");
      teardown();
      return;
    }

    const answer = { type: "answer" as const, sdp: await sdpRes.text() };
    await pc.setRemoteDescription(answer);
    setConn("live");
  };

  useEffect(() => () => teardown(), [teardown]);

  if (!gateway.enabled) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void (conn === "live" ? finishSession("manual_close") : connect())}
        className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
        disabled={conn === "connecting"}
      >
        {conn === "live" ? "End call" : conn === "connecting" ? "Connecting…" : "Talk to Saintly AI"}
      </button>
      {conn === "live" ? (
        <p className="mt-1 text-xs text-slate-600">
          Auto-ends after {Math.round(gateway.inactivity_ms / 1000)}s quiet or {Math.round(gateway.max_session_ms / 1000)}s max.{" "}
          {voicePhiNotice} ChatGPT Plus does not cover API spend — this path uses ephemeral OpenAI credentials only
          (not your account API keys in the bundle).
        </p>
      ) : null}
      {note ? <p className="mt-1 text-xs text-rose-700">{note}</p> : null}
    </div>
  );
}
