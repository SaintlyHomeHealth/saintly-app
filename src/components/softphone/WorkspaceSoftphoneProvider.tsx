"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Call, Device } from "@twilio/voice-sdk";

import { routePerfLog, routePerfStart } from "@/lib/perf/route-perf";

let twilioVoiceModule: Promise<typeof import("@twilio/voice-sdk")> | null = null;
function loadTwilioVoiceSdk() {
  twilioVoiceModule ??= import("@twilio/voice-sdk");
  return twilioVoiceModule;
}

/** Lets the Saintly iOS/Android shell register Twilio Voice native (CallKit / ConnectionService) with the same access token as the web Device. */
function postSoftphoneTokenToNativeBridge(token: string, identity?: string | null) {
  if (typeof window === "undefined") return;
  const id = typeof identity === "string" && identity.trim() ? identity.trim() : undefined;
  const payload = JSON.stringify({ type: "saintly-softphone-token", token, ...(id ? { identity: id } : {}) });

  const retryDelaysMs = [25, 75, 150, 300, 600, 1200, 2000];

  const tryPost = (attempt: number) => {
    const bridge = (
      window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } }
    ).ReactNativeWebView;
    if (bridge?.postMessage) {
      try {
        bridge.postMessage(payload);
        return;
      } catch {
        // fall through to retry
      }
    }
    if (attempt >= retryDelaysMs.length) {
      console.warn(
        "[SAINTLY-NATIVE-BRIDGE] ReactNativeWebView.postMessage unavailable after retries — native CallKit / VoIP registration will not run"
      );
      return;
    }
    setTimeout(() => tryPost(attempt + 1), retryDelaysMs[attempt]);
  };

  tryPost(0);
}

import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import {
  formatInboundCallerFromRaw,
  readIncomingCallerRawFromCall,
} from "@/lib/softphone/twilio-incoming-caller-display";
import { createRingtoneObjectUrl } from "@/lib/softphone/ringtone-wav";
import {
  WORKSPACE_SOFTPHONE_FORCE_CLEAR_EVENT,
  dispatchWorkspaceSoftphoneUi,
  type WorkspaceSoftphoneForceClearDetail,
} from "@/lib/softphone/workspace-ui-events";
import { twilioErrorToFriendly } from "@/lib/softphone/twilio-user-friendly-errors";
import type { ConferenceGatingSnapshot } from "@/lib/phone/conference-gating";
import type { LiveTranscriptEntry } from "@/lib/phone/live-transcript-entries";
import type { SoftphoneTranscriptStreamsMeta } from "@/lib/phone/softphone-transcript-stream-meta";
import type { SoftphoneRecordingMeta } from "@/lib/twilio/softphone-recording-types";

type CallHandle = Awaited<ReturnType<Device["connect"]>>;

type IncomingCallerUi = {
  rawFrom: string;
  formattedNumber: string;
  contactName: string | null;
  subtitle: string | null;
};

type InboundAiAssistState = {
  callSid: string | null;
  rawFrom: string | null;
  formattedNumber: string | null;
  contactName: string | null;
  subtitle: string | null;
};

export type CallContextVoiceAi = {
  short_summary: string | null;
  urgency: string | null;
  route_target: string | null;
  caller_category: string | null;
  live_transcript_excerpt: string | null;
  /** Append-only lines from Media Stream bridge (preferred over excerpt for live UI). */
  live_transcript_entries: LiveTranscriptEntry[] | null;
  recommended_action: string | null;
  confidence_summary: string | null;
  softphone_transcript_streams: SoftphoneTranscriptStreamsMeta | null;
  /** Inbound PSTN transcript-only stream started server-side (no Enable click). */
  inbound_transcript_stream_started_at: string | null;
  inbound_transcript_mode: string | null;
  inbound_transcript_last_error: string | null;
};

export type SoftphoneConferenceContext = {
  conference_sid: string | null;
  pstn_call_sid: string | null;
  pstn_on_hold: boolean | null;
  mode: string | null;
};

export type CallDeskContext = {
  /** Twilio Client leg CallSid — matches `phone_calls.external_call_id` and server logs. */
  external_call_id: string | null;
  /** `phone_calls.id` for CRM / saved artifacts (when call-context found the row). */
  phone_call_id: string | null;
  voice_ai: CallContextVoiceAi | null;
  conference: SoftphoneConferenceContext | null;
  /** Server-computed gating — use for disabling controls with real reasons. */
  conference_gating: ConferenceGatingSnapshot | null;
  /** Manual recording state from `phone_calls.metadata.softphone_recording`. */
  softphone_recording: SoftphoneRecordingMeta | null;
  /** Staff softphone row (`metadata.source=twilio_voice_softphone`) — transcript is human-only. */
  workspace_softphone_session: boolean;
};

/** Snapshot after hangup so staff can review transcript + run post-call tools. */
export type PostCallTranscriptSnapshot = {
  desk: CallDeskContext;
  remoteLabel: string | null;
};

/** Server flags from `/api/workspace/phone/softphone-capabilities` (no secrets). */
export type SoftphoneServerCapabilities = {
  conference_outbound_enabled: boolean;
  media_stream_wss_configured: boolean;
  transcription_callback_configured?: boolean;
  legacy_bridge_transcript_configured?: boolean;
  transcript_writeback_configured: boolean;
};

type Ctx = {
  digits: string;
  setDigits: Dispatch<SetStateAction<string>>;
  listenState: "loading" | "ready" | "error";
  /** True while the Twilio Client leg is connected (answered outbound or inbound). */
  isInCall: boolean;
  status: "idle" | "fetching_token" | "connecting" | "in_call" | "error";
  hint: string | null;
  /** Extra UI for mapped Twilio/WebRTC errors (Settings / retry). */
  hintMeta: { suggestSettings: boolean; canRetry: boolean } | null;
  incomingCallerContactName: string | null;
  incomingCallerNumberFormatted: string;
  incomingCallerRawFrom: string | null;
  activeRemoteLabel: string | null;
  tokenIdentity: string | null;
  ringtoneUnlocked: boolean;
  busy: boolean;
  canDial: boolean;
  incoming: boolean;
  durationSec: number;
  /** Microphone mute (Twilio `Call.mute`). */
  micMuted: boolean;
  /** Client-side hold fallback when conference PSTN hold is unavailable. */
  isClientHold: boolean;
  /** Twilio Conference PSTN participant hold (true PSTN hold + hold music). */
  isPstnHold: boolean;
  holdBusy: boolean;
  toggleMute: () => void;
  toggleHold: () => Promise<void>;
  /** Second inbound while already on an active call (call waiting). */
  callWaiting: boolean;
  callWaitingCallerContactName: string | null;
  callWaitingNumberFormatted: string;
  callWaitingRawFrom: string | null;
  answerCallWaitingEndAndAccept: () => void;
  declineCallWaiting: () => void;
  /** AI summary + conference metadata polled from `phone_calls` for this CallSid. */
  callContext: CallDeskContext | null;
  /** Twilio env flags for conference + media stream (UI gating). */
  softphoneCapabilities: SoftphoneServerCapabilities | null;
  coldTransferTo: (toE164: string) => Promise<{ ok: boolean; error?: string }>;
  addConferenceParticipant: (toE164: string) => Promise<{ ok: boolean; error?: string }>;
  startLiveTranscriptStream: () => Promise<{ ok: boolean; error?: string }>;
  stopLiveTranscriptStream: () => Promise<{ ok: boolean; error?: string }>;
  /** Manual Dialpad-style: user must opt in before we treat transcript as “on”. */
  transcriptEnabled: boolean;
  setTranscriptEnabled: Dispatch<SetStateAction<boolean>>;
  transcriptPanelOpen: boolean;
  setTranscriptPanelOpen: Dispatch<SetStateAction<boolean>>;
  /** After hangup: last call desk + label for transcript review (cleared on dismiss or new call). */
  postCallTranscriptSnapshot: PostCallTranscriptSnapshot | null;
  dismissTranscriptPanel: () => void;
  enableTranscriptManual: () => Promise<void>;
  /** True while POST start-transcript is in flight (Enable Transcript / auto inbound). */
  transcriptStartPending: boolean;
  /** Set when start-transcript failed; cleared on success or new call. */
  transcriptStartError: string | null;
  clearTranscriptStartError: () => void;
  /** Manual Twilio-backed recording (metadata on phone_calls). */
  softphoneRecording: SoftphoneRecordingMeta | null;
  recordingBusy: boolean;
  recordingActionError: string | null;
  toggleCallRecording: () => Promise<void>;
  sendDtmfDigits: (digits: string) => void;
  /** Last call-context fetch failed (for transcript empty state). */
  callContextLoadError: boolean;
  clearCallError: () => void;
  startCall: (toOverride?: string) => Promise<void>;
  hangUp: () => void;
  answerIncoming: () => void;
  rejectIncoming: () => void;
  testRingtone: () => Promise<void>;
  unlockRingtoneFromGesture: () => Promise<void>;
};

const WorkspaceSoftphoneContext = createContext<Ctx | null>(null);

/** Reuse AI-assist PSTN/name if the Twilio Client transfer leg drops CLI (until TwiML params apply). */
const ASSIST_HANDOFF_SNAPSHOT_TTL_MS = 120_000;

type AssistHandoffSnapshot = { raw: string; contactName: string | null; subtitle: string | null; savedAt: number };

function mergeRawWithAssistSnapshot(
  rawFromCall: string,
  snapshot: AssistHandoffSnapshot | null,
  nowMs: number
): string {
  if (normalizePhone(rawFromCall).length >= 10) return rawFromCall;
  if (
    snapshot &&
    nowMs - snapshot.savedAt < ASSIST_HANDOFF_SNAPSHOT_TTL_MS &&
    normalizePhone(snapshot.raw).length >= 10
  ) {
    return snapshot.raw;
  }
  return rawFromCall;
}

function readTwilioParam(
  call: { parameters?: Record<string, string> } | null | undefined,
  keys: string[]
): string | null {
  if (!call?.parameters) return null;
  const p = call.parameters;
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Twilio CallSid on the Client leg; matches `phone_calls.external_call_id` for suppression after hangup. */
function readCallSid(call: { parameters?: Record<string, string> } | null | undefined): string | null {
  const sid = readTwilioParam(call, ["CallSid"]);
  return sid && sid.length > 0 ? sid : null;
}

function setRemoteAudioEnabled(call: Call, enabled: boolean) {
  const stream = call.getRemoteStream();
  stream?.getAudioTracks().forEach((t) => {
    t.enabled = enabled;
  });
}

function formatDialpadDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/[*#]/.test(t)) return t;
  if (t.startsWith("+")) {
    const rest = t.slice(1).replace(/\D/g, "");
    if (!rest) return "+";
    if (rest.length <= 10) {
      if (rest.length <= 3) return `+${rest}`;
      if (rest.length <= 6) return `+${rest.slice(0, 3)} ${rest.slice(3)}`;
      return `+${rest.slice(0, 3)} ${rest.slice(3, 6)}-${rest.slice(6)}`;
    }
    return `+${rest}`;
  }
  const d = t.replace(/\D/g, "");
  if (!d) return t;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}${d.length > 10 ? ` ${d.slice(10)}` : ""}`;
}

function formatIncomingCallerLine(
  name: string | null | undefined,
  subtitle: string | null | undefined,
  formattedNumber: string
): string {
  const n = name?.trim();
  const s = subtitle?.trim();
  if (n && s) return `${n} · ${s} · ${formattedNumber}`;
  if (n) return `${n} · ${formattedNumber}`;
  return formattedNumber;
}

export function WorkspaceSoftphoneProvider({ children }: { children: React.ReactNode }) {
  const [digits, setDigits] = useState("");
  const [listenState, setListenState] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState<"idle" | "fetching_token" | "connecting" | "in_call" | "error">("idle");
  const [hint, setHint] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [callWaitingCall, setCallWaitingCall] = useState<Call | null>(null);
  const [incomingCallerUi, setIncomingCallerUi] = useState<IncomingCallerUi | null>(null);
  const [callWaitingCallerUi, setCallWaitingCallerUi] = useState<IncomingCallerUi | null>(null);
  const [hintMeta, setHintMeta] = useState<{ suggestSettings: boolean; canRetry: boolean } | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [isClientHold, setIsClientHold] = useState(false);
  const [isPstnHold, setIsPstnHold] = useState(false);
  const [holdBusy, setHoldBusy] = useState(false);
  const micMutedBeforeHoldRef = useRef(false);
  const [callContext, setCallContext] = useState<CallDeskContext | null>(null);
  const [softphoneCapabilities, setSoftphoneCapabilities] = useState<SoftphoneServerCapabilities | null>(null);
  const [tokenIdentity, setTokenIdentity] = useState<string | null>(null);
  const [ringtoneUnlocked, setRingtoneUnlocked] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [callStartedAtMs, setCallStartedAtMs] = useState<number | null>(null);
  const [inboundAiAssist, setInboundAiAssist] = useState<InboundAiAssistState | null>(null);
  const statusRef = useRef(status);
  const ringtoneUnlockedRef = useRef(false);
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<CallHandle | null>(null);
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const testRingtoneStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assistHandoffSnapshotRef = useRef<AssistHandoffSnapshot | null>(null);
  /** After local hangup, ignore stale `inbound-active` rows until DB flips or a new CallSid appears. */
  const pollSuppressedSidRef = useRef<string | null>(null);
  const lastPollCallSidRef = useRef<string | null>(null);
  const prevTranscriptLenRef = useRef(0);
  const transcriptStreamStartedRef = useRef(false);
  const transcriptStartInFlightRef = useRef(false);
  /** Dedupe UI auto-enable when server inbound transcript metadata arrives. */
  const inboundServerTranscriptUiKeyRef = useRef<string | null>(null);
  const pstnTranscriptFollowupBusyRef = useRef(false);
  const lastPstnOnlyAttemptRef = useRef<{ sid: string; at: number } | null>(null);
  const [transcriptEnabled, setTranscriptEnabled] = useState(false);
  const [transcriptStartPending, setTranscriptStartPending] = useState(false);
  const [transcriptStartError, setTranscriptStartError] = useState<string | null>(null);
  const [transcriptPanelOpen, setTranscriptPanelOpen] = useState(false);
  const [postCallTranscriptSnapshot, setPostCallTranscriptSnapshot] = useState<PostCallTranscriptSnapshot | null>(
    null
  );
  const [callContextLoadError, setCallContextLoadError] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingActionError, setRecordingActionError] = useState<string | null>(null);

  const clearTranscriptStartError = useCallback(() => {
    setTranscriptStartError(null);
  }, []);

  const callContextRef = useRef(callContext);
  const transcriptPanelOpenRef = useRef(transcriptPanelOpen);
  const transcriptEnabledRef = useRef(transcriptEnabled);
  useEffect(() => {
    callContextRef.current = callContext;
  }, [callContext]);
  useEffect(() => {
    transcriptPanelOpenRef.current = transcriptPanelOpen;
  }, [transcriptPanelOpen]);
  useEffect(() => {
    transcriptEnabledRef.current = transcriptEnabled;
  }, [transcriptEnabled]);

  const dismissTranscriptPanel = useCallback(() => {
    setTranscriptPanelOpen(false);
    setPostCallTranscriptSnapshot(null);
  }, []);

  const startLiveTranscriptStream = useCallback(async () => {
    if (transcriptStreamStartedRef.current) return { ok: true as const };
    if (transcriptStartInFlightRef.current) return { ok: true as const };
    const c = activeCallRef.current;
    if (!c) return { ok: false as const, error: "No active call" };
    const sid = readCallSid(c);
    if (!sid) return { ok: false as const, error: "No CallSid" };
    transcriptStartInFlightRef.current = true;
    try {
      const res = await fetch("/api/workspace/phone/conference/start-transcript", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callSid: sid }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        console.warn("[transcript] start_transcript_fetch_failed", {
          http_status: res.status,
          error: j.error ?? null,
        });
        if (j.code === "transcription_callback_not_configured") {
          return {
            ok: false as const,
            error:
              "Live transcript is not configured yet. Set TWILIO_WEBHOOK_BASE_URL or TWILIO_PUBLIC_BASE_URL to your public https:// origin so Twilio can POST transcription events.",
          };
        }
        return { ok: false as const, error: j.error ?? `HTTP ${res.status}` };
      }
      await res.json().catch(() => ({}));
      transcriptStreamStartedRef.current = true;
      return { ok: true as const };
    } finally {
      transcriptStartInFlightRef.current = false;
    }
  }, []);

  const enableTranscriptManual = useCallback(async () => {
    setTranscriptStartError(null);
    if (transcriptStreamStartedRef.current) {
      setTranscriptEnabled(true);
      return;
    }
    setTranscriptStartPending(true);
    try {
      const r = await startLiveTranscriptStream();
      if (r.ok) {
        setTranscriptEnabled(true);
      } else {
        setTranscriptEnabled(false);
        setTranscriptStartError(r.error ?? "Live transcription failed to start.");
      }
    } catch (e) {
      setTranscriptEnabled(false);
      setTranscriptStartError(e instanceof Error ? e.message : "Network error starting transcription.");
    } finally {
      setTranscriptStartPending(false);
    }
  }, [startLiveTranscriptStream]);

  const stopLiveTranscriptStream = useCallback(async () => {
    const c = activeCallRef.current;
    if (!c) return { ok: false as const, error: "No active call" };
    const sid = readCallSid(c);
    if (!sid) return { ok: false as const, error: "No CallSid" };
    const res = await fetch("/api/workspace/phone/conference/stop-transcript", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callSid: sid }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false as const, error: j.error ?? `HTTP ${res.status}` };
    }
    transcriptStreamStartedRef.current = false;
    return { ok: true as const };
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/workspace/phone/softphone-capabilities", { credentials: "include" });
        if (!res.ok) return;
        const j = (await res.json()) as {
          conference_outbound_enabled?: boolean;
          media_stream_wss_configured?: boolean;
          transcription_callback_configured?: boolean;
          legacy_bridge_transcript_configured?: boolean;
          transcript_writeback_configured?: boolean;
        };
        if (cancelled) return;
        setSoftphoneCapabilities({
          conference_outbound_enabled: Boolean(j.conference_outbound_enabled),
          media_stream_wss_configured: Boolean(j.media_stream_wss_configured),
          transcription_callback_configured: Boolean(j.transcription_callback_configured),
          legacy_bridge_transcript_configured: Boolean(j.legacy_bridge_transcript_configured),
          transcript_writeback_configured: Boolean(j.transcript_writeback_configured),
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!callStartedAtMs) {
      setDurationSec(0);
      return;
    }
    const tick = () => {
      setDurationSec(Math.max(0, Math.floor((Date.now() - callStartedAtMs) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [callStartedAtMs]);

  useEffect(() => {
    if (status !== "in_call") {
      setCallContext(null);
      lastPollCallSidRef.current = null;
      prevTranscriptLenRef.current = 0;
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const sid = readCallSid(activeCallRef.current);
      if (!sid) {
        if (!cancelled) setCallContext(null);
        return;
      }
      if (sid !== lastPollCallSidRef.current) {
        lastPollCallSidRef.current = sid;
        prevTranscriptLenRef.current = 0;
      }
      try {
        const res = await fetch(`/api/workspace/phone/call-context?call_sid=${encodeURIComponent(sid)}`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (!res.ok) {
          if (!cancelled) setCallContextLoadError(true);
          return;
        }
        const currentSid = readCallSid(activeCallRef.current);
        if (currentSid !== sid) return;
        const j = (await res.json()) as {
          found?: boolean;
          phone_call_id?: string;
          external_call_id?: string;
          workspace_softphone_session?: boolean;
          voice_ai?: (CallContextVoiceAi & { live_transcript_entries?: LiveTranscriptEntry[] | null }) | null;
          softphone_conference?: SoftphoneConferenceContext | null;
          conference_gating?: ConferenceGatingSnapshot | null;
          softphone_recording?: SoftphoneRecordingMeta | null;
        };
        if (cancelled) return;
        if (!cancelled) setCallContextLoadError(false);
        if (j.found) {
          const inboundTs = j.voice_ai?.inbound_transcript_stream_started_at;
          /** Inbound browser sessions are `twilio_voice_softphone` — still auto-enable when server started PSTN transcript. */
          const serverInboundStarted = typeof inboundTs === "string";
          if (serverInboundStarted) {
            const key = `${sid}:${inboundTs}`;
            if (inboundServerTranscriptUiKeyRef.current !== key) {
              inboundServerTranscriptUiKeyRef.current = key;
              setTranscriptPanelOpen(true);
              void (async () => {
                setTranscriptStartError(null);
                setTranscriptStartPending(true);
                try {
                  const r = await startLiveTranscriptStream();
                  if (r.ok) {
                    setTranscriptEnabled(true);
                  } else {
                    setTranscriptStartError(r.error ?? "Live transcription failed to start.");
                  }
                } catch (e) {
                  setTranscriptStartError(e instanceof Error ? e.message : "Network error starting transcription.");
                } finally {
                  setTranscriptStartPending(false);
                }
              })();
            }
          }
          const entries = j.voice_ai?.live_transcript_entries;
          const entryLen = Array.isArray(entries) ? entries.length : 0;
          const excerpt = j.voice_ai?.live_transcript_excerpt;
          const excerptLen = typeof excerpt === "string" ? excerpt.length : 0;
          const tick = entryLen > 0 ? entryLen * 1_000_000 + excerptLen : excerptLen;
          if (tick !== prevTranscriptLenRef.current) {
            prevTranscriptLenRef.current = tick;
          }
          const va = j.voice_ai;
          setCallContext({
            external_call_id: typeof j.external_call_id === "string" ? j.external_call_id : null,
            phone_call_id: typeof j.phone_call_id === "string" ? j.phone_call_id : null,
            voice_ai: va
              ? {
                  short_summary: va.short_summary ?? null,
                  urgency: va.urgency ?? null,
                  route_target: va.route_target ?? null,
                  caller_category: va.caller_category ?? null,
                  live_transcript_excerpt: va.live_transcript_excerpt ?? null,
                  live_transcript_entries: va.live_transcript_entries ?? null,
                  recommended_action: va.recommended_action ?? null,
                  confidence_summary: va.confidence_summary ?? null,
                  softphone_transcript_streams: va.softphone_transcript_streams ?? null,
                  inbound_transcript_stream_started_at: va.inbound_transcript_stream_started_at ?? null,
                  inbound_transcript_mode: va.inbound_transcript_mode ?? null,
                  inbound_transcript_last_error: va.inbound_transcript_last_error ?? null,
                }
              : null,
            conference: j.softphone_conference ?? null,
            conference_gating: j.conference_gating ?? null,
            softphone_recording: j.softphone_recording ?? null,
            workspace_softphone_session: Boolean(j.workspace_softphone_session),
          });
          if (typeof j.softphone_conference?.pstn_on_hold === "boolean") {
            setIsPstnHold(j.softphone_conference.pstn_on_hold);
          }
        } else {
          setCallContext(null);
        }
      } catch {
        if (!cancelled) {
          setCallContext(null);
          setCallContextLoadError(true);
        }
      }
    };
    void poll();
    const intervalMs =
      status === "in_call" && !transcriptEnabled
        ? 800
        : transcriptEnabled && transcriptPanelOpen
          ? 700
          : transcriptEnabled
            ? 1400
            : 2200;
    const id = window.setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [status, transcriptEnabled, transcriptPanelOpen, startLiveTranscriptStream]);

  /**
   * When PSTN links after live transcript was already started, start the deferred PSTN inbound stream
   * (merge hook also tries server-side; this covers the client poll path).
   */
  useEffect(() => {
    if (status !== "in_call") {
      lastPstnOnlyAttemptRef.current = null;
      pstnTranscriptFollowupBusyRef.current = false;
      return;
    }
    const sid = readCallSid(activeCallRef.current);
    if (!sid) return;
    if (!transcriptEnabled || !transcriptStreamStartedRef.current) return;
    const pstn = callContext?.conference?.pstn_call_sid;
    const streams = callContext?.voice_ai?.softphone_transcript_streams;
    if (!pstn?.startsWith("CA")) return;
    if (streams?.pstn_stream_started_at) return;
    if (pstnTranscriptFollowupBusyRef.current) return;
    const last = lastPstnOnlyAttemptRef.current;
    if (last?.sid === sid && Date.now() - last.at < 5000) return;

    pstnTranscriptFollowupBusyRef.current = true;
    lastPstnOnlyAttemptRef.current = { sid, at: Date.now() };
    void fetch("/api/workspace/phone/conference/start-transcript", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callSid: sid, pstnOnly: true }),
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          skipped?: string;
          error?: string;
        };
        if (!res.ok || !j.ok) {
          console.warn("[transcript] pstn_transcript_deferred_request_failed", { status: res.status, body: j });
        }
      })
      .finally(() => {
        pstnTranscriptFollowupBusyRef.current = false;
      });
  }, [status, transcriptEnabled, callContext]);

  /**
   * Single teardown path for the browser leg: always returns UI to idle and clears conference/transcript state.
   * Safe to call multiple times (e.g. hangup + Twilio disconnect).
   */
  const finalizeCallCleanup = useCallback(
    (reason: string, options?: { endedCallSid?: string | null; clearHint?: boolean }) => {
      console.log("[softphone] finalizeCallCleanup", reason);

      const call = activeCallRef.current;
      const prevDesk = callContextRef.current;
      let remoteLabel: string | null = null;
      if (call) {
        const now = Date.now();
        const pstnRaw = mergeRawWithAssistSnapshot(
          readIncomingCallerRawFromCall(call),
          assistHandoffSnapshotRef.current,
          now
        );
        if (normalizePhone(pstnRaw).length >= 10) {
          remoteLabel = formatInboundCallerFromRaw(pstnRaw);
        } else {
          const tf = readTwilioParam(call, ["To", "From"]);
          if (tf?.toLowerCase().startsWith("client:")) {
            remoteLabel = "Internal / browser call";
          } else if (tf) {
            remoteLabel = formatInboundCallerFromRaw(tf);
          }
        }
      }
      if (!remoteLabel && digits.trim()) {
        remoteLabel = formatDialpadDisplay(digits);
      }

      const va = prevDesk?.voice_ai;
      const hasTranscript =
        (Array.isArray(va?.live_transcript_entries) && va.live_transcript_entries.length > 0) ||
        Boolean(va?.live_transcript_excerpt?.trim());

      const keepPostCall =
        Boolean(prevDesk) &&
        hasTranscript &&
        (transcriptPanelOpenRef.current || transcriptEnabledRef.current);

      if (keepPostCall && prevDesk) {
        setPostCallTranscriptSnapshot({ desk: prevDesk, remoteLabel });
        setTranscriptPanelOpen(true);
      } else {
        setPostCallTranscriptSnapshot(null);
        setTranscriptPanelOpen(false);
      }

      activeCallRef.current = null;
      setStatus("idle");
      setCallStartedAtMs(null);
      if (options?.clearHint !== false) {
        setHint(null);
        setHintMeta(null);
      }
      setMicMuted(false);
      setIsClientHold(false);
      setIsPstnHold(false);
      setHoldBusy(false);
      micMutedBeforeHoldRef.current = false;
      setCallContext(null);
      setInboundAiAssist(null);
      lastPollCallSidRef.current = null;
      prevTranscriptLenRef.current = 0;
      setTranscriptEnabled(false);
      setTranscriptStartPending(false);
      setTranscriptStartError(null);
      setCallContextLoadError(false);
      setRecordingBusy(false);
      setRecordingActionError(null);
      transcriptStreamStartedRef.current = false;
      transcriptStartInFlightRef.current = false;
      inboundServerTranscriptUiKeyRef.current = null;
      lastPstnOnlyAttemptRef.current = null;
      pstnTranscriptFollowupBusyRef.current = false;
      if (options?.endedCallSid) {
        pollSuppressedSidRef.current = options.endedCallSid;
      }
      dispatchWorkspaceSoftphoneUi({ phase: "idle" });
    },
    [digits]
  );

  const bindDeviceLifecycle = useCallback(
    (device: Device) => {
      device.on("error", (err) => {
        console.error("[softphone] device error", err);
        const friendly = twilioErrorToFriendly(err);
        setHint(friendly.userMessage);
        setHintMeta({ suggestSettings: friendly.suggestOpenSettings, canRetry: friendly.canRetry });
      });
      device.on("incoming", (call) => {
        if (activeCallRef.current) {
          setCallWaitingCall(call);
          call.on("disconnect", () => {
            console.log("[softphone] Twilio disconnect (call waiting leg)");
            setCallWaitingCall((c) => (c === call ? null : c));
            setCallWaitingCallerUi(null);
          });
          call.on("cancel", () => {
            console.log("[softphone] Twilio cancel (call waiting leg)");
            setCallWaitingCall((c) => (c === call ? null : c));
            setCallWaitingCallerUi(null);
          });
        } else {
          setIncomingCall(call);
          call.on("disconnect", (disconnectedArg: Call | undefined) => {
            const disconnected = disconnectedArg ?? call;
            console.log("[softphone] Twilio disconnect (incoming ring)", readCallSid(disconnected));
            setIncomingCall((c) => (c === call ? null : c));
            setHint(null);
            setHintMeta(null);
          });
          call.on("cancel", () => {
            console.log("[softphone] Twilio cancel (incoming ring)");
            setIncomingCall((c) => (c === call ? null : c));
          });
          call.on("reject", () => {
            console.log("[softphone] Twilio reject (incoming ring)");
            setIncomingCall((c) => (c === call ? null : c));
          });
        }
      });
    },
    []
  );

  const attachActiveCallHandlers = useCallback(
    (call: Call | CallHandle) => {
      const sidAtStart = readCallSid(call);
      console.log("[softphone] active call created", sidAtStart ? `${sidAtStart.slice(0, 10)}…` : "(no CallSid yet)");
      activeCallRef.current = call;
      setTranscriptEnabled(false);
      setTranscriptStartPending(false);
      setTranscriptStartError(null);
      setTranscriptPanelOpen(false);
      setPostCallTranscriptSnapshot(null);
      setCallContextLoadError(false);
      transcriptStreamStartedRef.current = false;
      transcriptStartInFlightRef.current = false;
      setStatus("in_call");
      setCallStartedAtMs(Date.now());
      call.on("disconnect", (disconnectedArg) => {
        const disconnected = disconnectedArg ?? call;
        const sid = readCallSid(disconnected);
        console.log("[softphone] Twilio disconnect event", sid ? `${sid.slice(0, 10)}…` : "(unknown)");
        finalizeCallCleanup("twilio:call.disconnect", { endedCallSid: sid });
      });
      call.on("cancel", () => {
        console.log("[softphone] Twilio cancel (active leg)");
        finalizeCallCleanup("twilio:call.cancel", { endedCallSid: readCallSid(call) });
      });
      call.on("reject", () => {
        console.log("[softphone] Twilio reject (active leg)");
        finalizeCallCleanup("twilio:call.reject", { endedCallSid: readCallSid(call) });
      });
      call.on("error", (err) => {
        console.error("[softphone] active call error", err);
        const friendly = twilioErrorToFriendly(err);
        finalizeCallCleanup("twilio:call.error", { endedCallSid: readCallSid(call), clearHint: false });
        setHint(friendly.userMessage);
        setHintMeta({ suggestSettings: friendly.suggestOpenSettings, canRetry: friendly.canRetry });
      });
      setMicMuted(call.isMuted());
      call.on("mute", (muted: boolean) => {
        setMicMuted(muted);
      });
    },
    [finalizeCallCleanup]
  );

  useEffect(() => {
    if (!inboundAiAssist?.rawFrom || normalizePhone(inboundAiAssist.rawFrom).length < 10) {
      return;
    }
    assistHandoffSnapshotRef.current = {
      raw: inboundAiAssist.rawFrom,
      contactName: inboundAiAssist.contactName ?? null,
      subtitle: inboundAiAssist.subtitle ?? null,
      savedAt: Date.now(),
    };
  }, [inboundAiAssist]);

  useEffect(() => {
    if (!incomingCall) {
      setIncomingCallerUi(null);
      return;
    }
    const now = Date.now();
    const raw = mergeRawWithAssistSnapshot(
      readIncomingCallerRawFromCall(incomingCall),
      assistHandoffSnapshotRef.current,
      now
    );
    const snap = assistHandoffSnapshotRef.current;
    const snapMatches =
      snap != null &&
      now - snap.savedAt < ASSIST_HANDOFF_SNAPSHOT_TTL_MS &&
      normalizePhone(snap.raw).length >= 10 &&
      normalizePhone(snap.raw) === normalizePhone(raw) &&
      normalizePhone(raw).length >= 10;
    const seededContactName = snapMatches && snap ? snap.contactName : null;
    const seededSubtitle = snapMatches && snap ? snap.subtitle : null;

    const formattedNumber = formatInboundCallerFromRaw(raw);
    setIncomingCallerUi({
      rawFrom: raw,
      formattedNumber,
      contactName: seededContactName,
      subtitle: seededSubtitle,
    });

    const lower = raw.toLowerCase();
    const digits = normalizePhone(raw);
    if (lower.startsWith("client:") || digits.length < 10 || !raw.trim()) {
      return;
    }

    let cancelled = false;
    const q = encodeURIComponent(raw);
    void fetch(`/api/workspace/phone/incoming-caller-lookup?from=${q}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { contactName?: unknown; subtitle?: unknown } | null) => {
        const name = j && typeof j.contactName === "string" ? j.contactName.trim() : "";
        const subtitle =
          j && typeof j.subtitle === "string" && j.subtitle.trim() ? j.subtitle.trim() : null;
        if (cancelled || !name) return;
        setIncomingCallerUi((prev) =>
          prev && prev.rawFrom === raw ? { ...prev, contactName: name, subtitle } : prev
        );
      });
    return () => {
      cancelled = true;
    };
  }, [incomingCall]);

  useEffect(() => {
    if (!callWaitingCall) {
      setCallWaitingCallerUi(null);
      return;
    }
    const now = Date.now();
    const raw = mergeRawWithAssistSnapshot(
      readIncomingCallerRawFromCall(callWaitingCall),
      assistHandoffSnapshotRef.current,
      now
    );
    const snap = assistHandoffSnapshotRef.current;
    const snapMatches =
      snap != null &&
      now - snap.savedAt < ASSIST_HANDOFF_SNAPSHOT_TTL_MS &&
      normalizePhone(snap.raw).length >= 10 &&
      normalizePhone(snap.raw) === normalizePhone(raw) &&
      normalizePhone(raw).length >= 10;
    const seededContactName = snapMatches && snap ? snap.contactName : null;
    const seededSubtitle = snapMatches && snap ? snap.subtitle : null;

    const formattedNumber = formatInboundCallerFromRaw(raw);
    setCallWaitingCallerUi({
      rawFrom: raw,
      formattedNumber,
      contactName: seededContactName,
      subtitle: seededSubtitle,
    });

    const lower = raw.toLowerCase();
    const digits = normalizePhone(raw);
    if (lower.startsWith("client:") || digits.length < 10 || !raw.trim()) {
      return;
    }

    let cancelled = false;
    const q = encodeURIComponent(raw);
    void fetch(`/api/workspace/phone/incoming-caller-lookup?from=${q}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { contactName?: unknown; subtitle?: unknown } | null) => {
        const name = j && typeof j.contactName === "string" ? j.contactName.trim() : "";
        const subtitle =
          j && typeof j.subtitle === "string" && j.subtitle.trim() ? j.subtitle.trim() : null;
        if (cancelled || !name) return;
        setCallWaitingCallerUi((prev) =>
          prev && prev.rawFrom === raw ? { ...prev, contactName: name, subtitle } : prev
        );
      });
    return () => {
      cancelled = true;
    };
  }, [callWaitingCall]);

  useEffect(() => {
    if (!inboundAiAssist?.rawFrom || inboundAiAssist.contactName) return;
    const raw = inboundAiAssist.rawFrom;
    const digits = normalizePhone(raw);
    if (digits.length < 10 || raw.toLowerCase().startsWith("client:")) return;

    let cancelled = false;
    const q = encodeURIComponent(raw);
    void fetch(`/api/workspace/phone/incoming-caller-lookup?from=${q}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { contactName?: unknown; subtitle?: unknown } | null) => {
        const name = j && typeof j.contactName === "string" ? j.contactName.trim() : "";
        const subtitle =
          j && typeof j.subtitle === "string" && j.subtitle.trim() ? j.subtitle.trim() : null;
        if (cancelled || !name) return;
        setInboundAiAssist((prev) =>
          prev && prev.rawFrom === raw ? { ...prev, contactName: name, subtitle } : prev
        );
      });
    return () => {
      cancelled = true;
    };
  }, [inboundAiAssist?.rawFrom, inboundAiAssist?.contactName]);

  useEffect(() => {
    if (incomingCall) {
      const raw = mergeRawWithAssistSnapshot(
        readIncomingCallerRawFromCall(incomingCall),
        assistHandoffSnapshotRef.current,
        Date.now()
      );
      const uiMatches = Boolean(incomingCallerUi && incomingCallerUi.rawFrom === raw);
      const formatted =
        uiMatches && incomingCallerUi?.formattedNumber
          ? incomingCallerUi.formattedNumber
          : formatInboundCallerFromRaw(raw);
      const name = uiMatches ? (incomingCallerUi?.contactName ?? null) : null;
      const sub = uiMatches ? (incomingCallerUi?.subtitle ?? null) : null;
      const remoteLabel = formatIncomingCallerLine(name, sub, formatted);
      dispatchWorkspaceSoftphoneUi({ phase: "incoming", remoteLabel });
      return;
    }
    if (status === "in_call") {
      const active = activeCallRef.current;
      let remote: string | null = null;
      if (active) {
        const pstnRaw = mergeRawWithAssistSnapshot(
          readIncomingCallerRawFromCall(active),
          assistHandoffSnapshotRef.current,
          Date.now()
        );
        if (normalizePhone(pstnRaw).length >= 10) {
          remote = formatInboundCallerFromRaw(pstnRaw);
        } else {
          const tf = readTwilioParam(active, ["To", "From"]);
          if (tf?.toLowerCase().startsWith("client:")) {
            remote = "Internal / browser call";
          } else if (tf) {
            remote = formatInboundCallerFromRaw(tf);
          }
        }
      }
      if (!remote) {
        remote = digits.trim() ? formatDialpadDisplay(digits) : null;
      }
      dispatchWorkspaceSoftphoneUi({ phase: "active", remoteLabel: remote });
      return;
    }
    if (status === "fetching_token" || status === "connecting") {
      const remote = digits.trim() ? formatDialpadDisplay(digits) : null;
      dispatchWorkspaceSoftphoneUi({ phase: "outbound_ringing", remoteLabel: remote });
      return;
    }
    if (inboundAiAssist) {
      const r = inboundAiAssist.rawFrom ?? "";
      const d = normalizePhone(r);
      const fmt =
        inboundAiAssist.formattedNumber ||
        (d.length >= 10 ? formatPhoneNumber(r) : formatInboundCallerFromRaw(r));
      const remote =
        inboundAiAssist.contactName && d.length >= 10
          ? formatIncomingCallerLine(inboundAiAssist.contactName, inboundAiAssist.subtitle, fmt)
          : fmt;
      dispatchWorkspaceSoftphoneUi({
        phase: "inbound_ai_assist",
        remoteLabel: remote,
      });
      return;
    }
    dispatchWorkspaceSoftphoneUi({ phase: "idle" });
  }, [incomingCall, incomingCallerUi, status, digits, inboundAiAssist]);

  useEffect(() => {
    if (listenState !== "ready") {
      setInboundAiAssist(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        const res = await fetch("/api/workspace/phone/inbound-active", { credentials: "include" });
        if (cancelled) return;
        if (!res.ok) {
          setInboundAiAssist(null);
          return;
        }
        const j = (await res.json()) as {
          active?: boolean;
          from_e164?: string | null;
          external_call_id?: string | null;
        };
        if (j.active) {
          const e164 = typeof j.from_e164 === "string" ? j.from_e164 : null;
          const sid = typeof j.external_call_id === "string" ? j.external_call_id : null;
          if (sid && pollSuppressedSidRef.current && sid === pollSuppressedSidRef.current) {
            setInboundAiAssist(null);
            return;
          }
          const digits = normalizePhone(e164 ?? "");
          setInboundAiAssist((prev) => {
            const sameCall = Boolean(sid && prev?.callSid === sid);
            const formatted =
              e164 && digits.length >= 10
                ? formatPhoneNumber(e164)
                : e164 && e164.length > 0
                  ? e164
                  : "Unknown caller";
            return {
              callSid: sid,
              rawFrom: e164,
              formattedNumber: formatted,
              contactName: sameCall ? (prev?.contactName ?? null) : null,
              subtitle: sameCall ? (prev?.subtitle ?? null) : null,
            };
          });
        } else {
          pollSuppressedSidRef.current = null;
          setInboundAiAssist(null);
        }
      } catch {
        if (!cancelled) setInboundAiAssist(null);
      }
    };
    void poll();
    const id = window.setInterval(poll, 3500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [listenState]);

  useEffect(() => {
    const { url, revoke } = createRingtoneObjectUrl();
    const a = new Audio(url);
    a.preload = "auto";
    ringtoneAudioRef.current = a;
    return () => {
      if (testRingtoneStopRef.current) {
        clearTimeout(testRingtoneStopRef.current);
        testRingtoneStopRef.current = null;
      }
      a.pause();
      a.src = "";
      ringtoneAudioRef.current = null;
      revoke();
    };
  }, []);

  const unlockRingtoneFromGesture = useCallback(async () => {
    if (ringtoneUnlockedRef.current) return;
    const a = ringtoneAudioRef.current;
    if (!a) return;
    try {
      await a.play();
      a.pause();
      a.currentTime = 0;
      ringtoneUnlockedRef.current = true;
      setRingtoneUnlocked(true);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    const a = ringtoneAudioRef.current;
    if (!incomingCall || !ringtoneUnlocked || !a) return;
    a.loop = true;
    a.currentTime = 0;
    void a.play();
    return () => {
      a.pause();
      a.currentTime = 0;
      a.loop = false;
    };
  }, [incomingCall, ringtoneUnlocked]);

  const testRingtone = useCallback(async () => {
    await unlockRingtoneFromGesture();
    const a = ringtoneAudioRef.current;
    if (!a) return;
    if (testRingtoneStopRef.current) {
      clearTimeout(testRingtoneStopRef.current);
      testRingtoneStopRef.current = null;
    }
    a.loop = true;
    a.currentTime = 0;
    void a.play();
    testRingtoneStopRef.current = setTimeout(() => {
      a.pause();
      a.currentTime = 0;
      a.loop = false;
      testRingtoneStopRef.current = null;
    }, 2500);
  }, [unlockRingtoneFromGesture]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch("/api/softphone/token", { method: "GET", credentials: "include" });
        const body = (await res.json()) as {
          token?: string;
          identity?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.token) {
          setListenState("error");
          setHint(body.error ?? "Softphone token unavailable.");
          setHintMeta(null);
          return;
        }
        setTokenIdentity(typeof body.identity === "string" ? body.identity : null);
        const twilioLoadStart = routePerfStart();
        const { Device: TwilioDevice } = await loadTwilioVoiceSdk();
        const device = new TwilioDevice(body.token, { logLevel: "error" });
        bindDeviceLifecycle(device);
        await device.register();
        if (twilioLoadStart) {
          routePerfLog("softphone:twilio-import-register", twilioLoadStart);
        }
        if (cancelled) {
          device.destroy();
          return;
        }
        postSoftphoneTokenToNativeBridge(body.token, body.identity);
        deviceRef.current = device;
        setListenState("ready");
      } catch (e) {
        if (!cancelled) {
          setListenState("error");
          console.error("[softphone] device init failed", e);
          const friendly = twilioErrorToFriendly(e);
          setHint(friendly.userMessage);
          setHintMeta({ suggestSettings: friendly.suggestOpenSettings, canRetry: friendly.canRetry });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      activeCallRef.current?.disconnect();
      finalizeCallCleanup("provider:device_effect_cleanup");
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [bindDeviceLifecycle, finalizeCallCleanup]);

  useEffect(() => {
    const onForce = (ev: Event) => {
      const ce = ev as CustomEvent<WorkspaceSoftphoneForceClearDetail>;
      const reason =
        typeof ce.detail?.reason === "string" && ce.detail.reason.trim()
          ? ce.detail.reason.trim()
          : "workspace:softphoneForceClear";
      console.log("[softphone] workspace force clear", reason);
      finalizeCallCleanup(`workspace:force_clear:${reason}`);
    };
    window.addEventListener(WORKSPACE_SOFTPHONE_FORCE_CLEAR_EVENT, onForce);
    return () => window.removeEventListener(WORKSPACE_SOFTPHONE_FORCE_CLEAR_EVENT, onForce);
  }, [finalizeCallCleanup]);

  const hangUp = useCallback(() => {
    void (async () => {
      console.log("[softphone] hangup pressed");
      const c = activeCallRef.current;
      const sid = c ? readCallSid(c) : null;
      if (sid) {
        try {
          console.log("[softphone] server end-call request", { callSid: `${sid.slice(0, 10)}…` });
          const res = await fetch("/api/workspace/phone/conference/end-call", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callSid: sid }),
          });
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; steps?: string[]; error?: string };
          console.log("[softphone] server end-call response", res.status, j);
        } catch (e) {
          console.warn("[softphone] end-call server request failed", e);
        }
      } else {
        console.warn("[softphone] hangup with no activeCallRef — forcing idle UI");
      }
      if (c) {
        try {
          c.disconnect();
        } catch (e) {
          console.warn("[softphone] hangup disconnect threw", e);
        }
      }
      finalizeCallCleanup("hangup", { endedCallSid: sid });
    })();
  }, [finalizeCallCleanup]);

  const answerIncoming = useCallback(() => {
    const call = incomingCall;
    if (!call) return;
    call.accept();
    setIncomingCall(null);
    attachActiveCallHandlers(call);
  }, [incomingCall, attachActiveCallHandlers]);

  const rejectIncoming = useCallback(() => {
    incomingCall?.reject();
    setIncomingCall(null);
  }, [incomingCall]);

  const clearCallError = useCallback(() => {
    setHint(null);
    setHintMeta(null);
  }, []);

  const toggleMute = useCallback(() => {
    const c = activeCallRef.current;
    if (!c || isClientHold) return;
    c.mute(!c.isMuted());
  }, [isClientHold]);

  const toggleHold = useCallback(async () => {
    const c = activeCallRef.current;
    if (!c || holdBusy) return;
    const sid = readCallSid(c);
    if (!sid) return;

    const currentlyHeld = isPstnHold || isClientHold;

    if (isPstnHold) {
      setHoldBusy(true);
      try {
        const res = await fetch("/api/workspace/phone/conference/hold", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hold: false, callSid: sid }),
        });
        if (res.ok) {
          setIsPstnHold(false);
          return;
        }
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setHint(j.error ?? "Could not resume the call.");
      } finally {
        setHoldBusy(false);
      }
      return;
    }

    if (!currentlyHeld) {
      setHoldBusy(true);
      try {
        const res = await fetch("/api/workspace/phone/conference/hold", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hold: true, callSid: sid }),
        });
        if (res.ok) {
          setIsPstnHold(true);
          return;
        }
        if (res.status === 409) {
          micMutedBeforeHoldRef.current = c.isMuted();
          c.mute(true);
          setRemoteAudioEnabled(c, false);
          setIsClientHold(true);
          setMicMuted(true);
          setHint(null);
          return;
        }
        const j = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        setHint(j.hint ?? j.error ?? "Hold is not available yet.");
      } finally {
        setHoldBusy(false);
      }
      return;
    }

    if (isClientHold) {
      c.mute(micMutedBeforeHoldRef.current);
      setRemoteAudioEnabled(c, true);
      setIsClientHold(false);
      setMicMuted(c.isMuted());
    }
  }, [holdBusy, isPstnHold, isClientHold]);

  const coldTransferTo = useCallback(async (toE164: string) => {
    const c = activeCallRef.current;
    if (!c) return { ok: false as const, error: "No active call" };
    const sid = readCallSid(c);
    if (!sid) return { ok: false as const, error: "No CallSid" };
    console.log("[softphone] transfer started", { toE164, callSid: `${sid.slice(0, 10)}…` });
    const res = await fetch("/api/workspace/phone/conference/cold-transfer", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toE164, callSid: sid }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: j.error ?? `HTTP ${res.status}` };
    }
    console.log("[softphone] transfer completed (server accepted cold-transfer)", { toE164 });
    return { ok: true as const };
  }, []);

  const addConferenceParticipant = useCallback(async (toE164: string) => {
    const c = activeCallRef.current;
    if (!c) return { ok: false as const, error: "No active call" };
    const sid = readCallSid(c);
    if (!sid) return { ok: false as const, error: "No CallSid" };
    const res = await fetch("/api/workspace/phone/conference/add-participant", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toE164, callSid: sid }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: j.error ?? `HTTP ${res.status}` };
    }
    return { ok: true as const };
  }, []);

  const toggleCallRecording = useCallback(async () => {
    const c = activeCallRef.current;
    if (!c || recordingBusy) return;
    const sid = readCallSid(c);
    if (!sid) return;
    setRecordingBusy(true);
    setRecordingActionError(null);
    try {
      const rec = callContext?.softphone_recording;
      const isOn = rec?.status === "in-progress";
      const res = await fetch("/api/workspace/phone/call-recording", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isOn ? "stop" : "start", callSid: sid }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        recording?: SoftphoneRecordingMeta;
      };
      if (!res.ok || !j.ok) {
        setRecordingActionError(j.detail ?? j.error ?? "Recording could not be updated.");
        return;
      }
      if (j.recording) {
        setCallContext((prev) =>
          prev ? { ...prev, softphone_recording: j.recording ?? prev.softphone_recording } : prev
        );
      }
    } finally {
      setRecordingBusy(false);
    }
  }, [callContext, recordingBusy]);

  const sendDtmfDigits = useCallback((digits: string) => {
    const c = activeCallRef.current;
    if (!c || statusRef.current !== "in_call") return;
    const s = digits.replace(/[^0-9*#]/g, "");
    if (!s) return;
    try {
      c.sendDigits(s);
    } catch (e) {
      console.warn("[softphone] sendDigits failed", e);
    }
  }, []);

  const declineCallWaiting = useCallback(() => {
    callWaitingCall?.reject();
    setCallWaitingCall(null);
    setCallWaitingCallerUi(null);
  }, [callWaitingCall]);

  const answerCallWaitingEndAndAccept = useCallback(() => {
    const waiting = callWaitingCall;
    if (!waiting) return;
    setCallWaitingCall(null);
    setCallWaitingCallerUi(null);
    const cur = activeCallRef.current;
    const acceptWaiting = () => {
      try {
        waiting.accept();
        attachActiveCallHandlers(waiting);
      } catch (e) {
        console.error("[softphone] endAndAccept waiting", e);
        const friendly = twilioErrorToFriendly(e);
        setHint(friendly.userMessage);
        setHintMeta({ suggestSettings: friendly.suggestOpenSettings, canRetry: friendly.canRetry });
      }
    };
    if (cur) {
      cur.once("disconnect", acceptWaiting);
      cur.disconnect();
    } else {
      acceptWaiting();
    }
  }, [callWaitingCall, attachActiveCallHandlers]);

  const startCall = useCallback(
    async (toOverride?: string) => {
      setHint(null);
      setHintMeta(null);
      const raw = typeof toOverride === "string" ? toOverride : digits;
      const trimmed = raw.trim();
      const e164 = isValidE164(trimmed) ? trimmed : normalizeDialInputToE164(trimmed);
      if (!e164 || !isValidE164(e164)) {
        setHint("Enter a valid US number (10 digits) or full E.164 (e.g. +1…).");
        setHintMeta(null);
        return;
      }
      if (typeof toOverride === "string") setDigits(trimmed);

      setStatus("fetching_token");
      let tokenJson: {
        token?: string;
        identity?: string;
        error?: string;
      };
      try {
        const res = await fetch("/api/softphone/token", { method: "GET", credentials: "include" });
        tokenJson = (await res.json()) as typeof tokenJson;
        if (!res.ok || !tokenJson.token) {
          setStatus("error");
          setHint(tokenJson.error ?? `Could not get call token (${res.status}).`);
          setHintMeta(null);
          return;
        }
        if (typeof tokenJson.identity === "string") setTokenIdentity(tokenJson.identity);
      } catch {
        setStatus("error");
        setHint("Network error while requesting call token.");
        setHintMeta(null);
        return;
      }

      try {
        let device = deviceRef.current;
        if (!device) {
          const { Device: TwilioDevice } = await loadTwilioVoiceSdk();
          device = new TwilioDevice(tokenJson.token!, { logLevel: "error" });
          bindDeviceLifecycle(device);
          await device.register();
          postSoftphoneTokenToNativeBridge(tokenJson.token!, tokenJson.identity);
          deviceRef.current = device;
          setListenState("ready");
        } else {
          device.updateToken(tokenJson.token!);
          postSoftphoneTokenToNativeBridge(tokenJson.token!, tokenJson.identity);
        }
        setStatus("connecting");
        const call = await device.connect({ params: { To: e164 } });
        attachActiveCallHandlers(call);
      } catch (e) {
        console.error("[softphone] startCall failed", e);
        setStatus("error");
        const friendly = twilioErrorToFriendly(e);
        setHint(friendly.userMessage);
        setHintMeta({ suggestSettings: friendly.suggestOpenSettings, canRetry: friendly.canRetry });
      }
    },
    [digits, attachActiveCallHandlers, bindDeviceLifecycle]
  );

  const busy = status === "fetching_token" || status === "connecting" || status === "in_call";
  const canDial = listenState !== "loading" && !incomingCall && !callWaitingCall;

  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<{ to?: string }>;
      const to = ce?.detail?.to;
      if (!to || typeof to !== "string") return;
      if (!canDial || busy) return;
      void startCall(to);
    };
    window.addEventListener("softphone:dialTo", handler as EventListener);
    return () => window.removeEventListener("softphone:dialTo", handler as EventListener);
  }, [busy, canDial, startCall]);

  const value = useMemo<Ctx>(() => {
    let activeRemoteLabel: string | null = null;
    if (status === "in_call") {
      const now = Date.now();
      const active = activeCallRef.current;
      if (active) {
        const pstnRaw = mergeRawWithAssistSnapshot(
          readIncomingCallerRawFromCall(active),
          assistHandoffSnapshotRef.current,
          now
        );
        if (normalizePhone(pstnRaw).length >= 10) {
          activeRemoteLabel = formatInboundCallerFromRaw(pstnRaw);
        } else {
          const tf = readTwilioParam(active, ["To", "From"]);
          if (tf?.toLowerCase().startsWith("client:")) {
            activeRemoteLabel = "Internal / browser call";
          } else if (tf) {
            activeRemoteLabel = formatInboundCallerFromRaw(tf);
          }
        }
      }
      if (!activeRemoteLabel) {
        activeRemoteLabel = digits.trim() ? formatDialpadDisplay(digits) : null;
      }
    } else {
      activeRemoteLabel = digits.trim() ? formatDialpadDisplay(digits) : null;
    }
    return {
      digits,
      setDigits,
      listenState,
      isInCall: status === "in_call",
      status,
      hint,
      hintMeta,
      incomingCallerContactName: incomingCallerUi?.contactName ?? null,
      incomingCallerNumberFormatted: incomingCallerUi?.formattedNumber ?? "",
      incomingCallerRawFrom: incomingCallerUi?.rawFrom ?? null,
      activeRemoteLabel,
      tokenIdentity,
      ringtoneUnlocked,
      busy,
      canDial,
      incoming: Boolean(incomingCall),
      durationSec,
      micMuted,
      isClientHold,
      isPstnHold,
      holdBusy,
      toggleMute,
      toggleHold,
      callWaiting: Boolean(callWaitingCall),
      callWaitingCallerContactName: callWaitingCallerUi?.contactName ?? null,
      callWaitingNumberFormatted: callWaitingCallerUi?.formattedNumber ?? "",
      callWaitingRawFrom: callWaitingCallerUi?.rawFrom ?? null,
      answerCallWaitingEndAndAccept,
      declineCallWaiting,
      callContext,
      softphoneCapabilities,
      coldTransferTo,
      addConferenceParticipant,
      startLiveTranscriptStream,
      stopLiveTranscriptStream,
      transcriptEnabled,
      setTranscriptEnabled,
      transcriptPanelOpen,
      setTranscriptPanelOpen,
      postCallTranscriptSnapshot,
      dismissTranscriptPanel,
      enableTranscriptManual,
      transcriptStartPending,
      transcriptStartError,
      clearTranscriptStartError,
      softphoneRecording: callContext?.softphone_recording ?? null,
      recordingBusy,
      recordingActionError,
      toggleCallRecording,
      sendDtmfDigits,
      callContextLoadError,
      clearCallError,
      startCall,
      hangUp,
      answerIncoming,
      rejectIncoming,
      testRingtone,
      unlockRingtoneFromGesture,
    };
  }, [
    digits,
    listenState,
    status,
    hint,
    hintMeta,
    incomingCallerUi,
    tokenIdentity,
    ringtoneUnlocked,
    busy,
    canDial,
    incomingCall,
    callWaitingCall,
    callWaitingCallerUi,
    durationSec,
    micMuted,
    isClientHold,
    isPstnHold,
    holdBusy,
    toggleMute,
    toggleHold,
    coldTransferTo,
    addConferenceParticipant,
    startLiveTranscriptStream,
    stopLiveTranscriptStream,
    transcriptEnabled,
    setTranscriptEnabled,
    transcriptPanelOpen,
    setTranscriptPanelOpen,
    postCallTranscriptSnapshot,
    dismissTranscriptPanel,
    enableTranscriptManual,
    transcriptStartPending,
    transcriptStartError,
    clearTranscriptStartError,
    callContext,
    recordingBusy,
    recordingActionError,
    toggleCallRecording,
    sendDtmfDigits,
    callContextLoadError,
    answerCallWaitingEndAndAccept,
    declineCallWaiting,
    softphoneCapabilities,
    clearCallError,
    startCall,
    hangUp,
    answerIncoming,
    rejectIncoming,
    testRingtone,
    unlockRingtoneFromGesture,
  ]);

  return <WorkspaceSoftphoneContext.Provider value={value}>{children}</WorkspaceSoftphoneContext.Provider>;
}

export function useWorkspaceSoftphone() {
  const ctx = useContext(WorkspaceSoftphoneContext);
  if (!ctx) {
    throw new Error("useWorkspaceSoftphone must be used within WorkspaceSoftphoneProvider");
  }
  return ctx;
}
