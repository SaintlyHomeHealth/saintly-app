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

import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import {
  formatInboundCallerFromRaw,
  readIncomingCallerRawFromCall,
} from "@/lib/softphone/twilio-incoming-caller-display";
import { createRingtoneObjectUrl } from "@/lib/softphone/ringtone-wav";
import { dispatchWorkspaceSoftphoneUi } from "@/lib/softphone/workspace-ui-events";

type CallHandle = Awaited<ReturnType<Device["connect"]>>;

type IncomingCallerUi = {
  rawFrom: string;
  formattedNumber: string;
  contactName: string | null;
};

type InboundAiAssistState = {
  callSid: string | null;
  rawFrom: string | null;
  formattedNumber: string | null;
  contactName: string | null;
};

type Ctx = {
  digits: string;
  setDigits: Dispatch<SetStateAction<string>>;
  listenState: "loading" | "ready" | "error";
  status: "idle" | "fetching_token" | "connecting" | "in_call" | "error";
  hint: string | null;
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

type AssistHandoffSnapshot = { raw: string; contactName: string | null; savedAt: number };

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

export function WorkspaceSoftphoneProvider({ children }: { children: React.ReactNode }) {
  const [digits, setDigits] = useState("");
  const [listenState, setListenState] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState<"idle" | "fetching_token" | "connecting" | "in_call" | "error">("idle");
  const [hint, setHint] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [incomingCallerUi, setIncomingCallerUi] = useState<IncomingCallerUi | null>(null);
  const [tokenIdentity, setTokenIdentity] = useState<string | null>(null);
  const [ringtoneUnlocked, setRingtoneUnlocked] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [callStartedAtMs, setCallStartedAtMs] = useState<number | null>(null);
  const [inboundAiAssist, setInboundAiAssist] = useState<InboundAiAssistState | null>(null);
  const ringtoneUnlockedRef = useRef(false);
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<CallHandle | null>(null);
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const testRingtoneStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assistHandoffSnapshotRef = useRef<AssistHandoffSnapshot | null>(null);

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

  const bindDeviceLifecycle = useCallback((device: Device) => {
    device.on("error", (err) => {
      const msg =
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : String(err);
      setHint(msg || "Phone error");
    });
    device.on("incoming", (call) => {
      setIncomingCall(call);
      call.on("disconnect", () => setIncomingCall((c) => (c === call ? null : c)));
      call.on("cancel", () => setIncomingCall((c) => (c === call ? null : c)));
    });
  }, []);

  const attachActiveCallHandlers = useCallback((call: Call | CallHandle) => {
    activeCallRef.current = call;
    setStatus("in_call");
    setCallStartedAtMs(Date.now());
    call.on("disconnect", () => {
      activeCallRef.current = null;
      setStatus("idle");
      setHint(null);
      setCallStartedAtMs(null);
    });
    call.on("error", (err) => {
      setHint(err.message ?? "Call error");
    });
  }, []);

  useEffect(() => {
    return () => {
      dispatchWorkspaceSoftphoneUi({ phase: "idle" });
    };
  }, []);

  useEffect(() => {
    if (!inboundAiAssist?.rawFrom || normalizePhone(inboundAiAssist.rawFrom).length < 10) {
      return;
    }
    assistHandoffSnapshotRef.current = {
      raw: inboundAiAssist.rawFrom,
      contactName: inboundAiAssist.contactName ?? null,
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
      Boolean(snap) &&
      now - snap.savedAt < ASSIST_HANDOFF_SNAPSHOT_TTL_MS &&
      normalizePhone(snap.raw).length >= 10 &&
      normalizePhone(snap.raw) === normalizePhone(raw) &&
      normalizePhone(raw).length >= 10;
    const seededContactName = snapMatches ? snap.contactName : null;

    const formattedNumber = formatInboundCallerFromRaw(raw);
    setIncomingCallerUi({ rawFrom: raw, formattedNumber, contactName: seededContactName });

    const lower = raw.toLowerCase();
    const digits = normalizePhone(raw);
    if (lower.startsWith("client:") || digits.length < 10 || !raw.trim()) {
      return;
    }

    let cancelled = false;
    const q = encodeURIComponent(raw);
    void fetch(`/api/workspace/phone/incoming-caller-lookup?from=${q}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { contactName?: unknown } | null) => {
        const name = j && typeof j.contactName === "string" ? j.contactName.trim() : "";
        if (cancelled || !name) return;
        setIncomingCallerUi((prev) => (prev && prev.rawFrom === raw ? { ...prev, contactName: name } : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [incomingCall]);

  useEffect(() => {
    if (!inboundAiAssist?.rawFrom || inboundAiAssist.contactName) return;
    const raw = inboundAiAssist.rawFrom;
    const digits = normalizePhone(raw);
    if (digits.length < 10 || raw.toLowerCase().startsWith("client:")) return;

    let cancelled = false;
    const q = encodeURIComponent(raw);
    void fetch(`/api/workspace/phone/incoming-caller-lookup?from=${q}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { contactName?: unknown } | null) => {
        const name = j && typeof j.contactName === "string" ? j.contactName.trim() : "";
        if (cancelled || !name) return;
        setInboundAiAssist((prev) => (prev && prev.rawFrom === raw ? { ...prev, contactName: name } : prev));
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
      const remoteLabel = name ? `${name} · ${formatted}` : formatted;
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
          ? `${inboundAiAssist.contactName} · ${fmt}`
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
            };
          });
        } else {
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
        deviceRef.current = device;
        setListenState("ready");
      } catch (e) {
        if (!cancelled) {
          setListenState("error");
          const msg = e instanceof Error ? e.message : "Softphone init failed.";
          setHint(msg);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      activeCallRef.current?.disconnect();
      activeCallRef.current = null;
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [bindDeviceLifecycle]);

  const hangUp = useCallback(() => {
    activeCallRef.current?.disconnect();
    activeCallRef.current = null;
    setStatus("idle");
    setHint(null);
    setCallStartedAtMs(null);
  }, []);

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

  const startCall = useCallback(
    async (toOverride?: string) => {
      setHint(null);
      const raw = typeof toOverride === "string" ? toOverride : digits;
      const trimmed = raw.trim();
      const e164 = isValidE164(trimmed) ? trimmed : normalizeDialInputToE164(trimmed);
      if (!e164 || !isValidE164(e164)) {
        setHint("Enter a valid US number (10 digits) or full E.164 (e.g. +1…).");
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
          return;
        }
        if (typeof tokenJson.identity === "string") setTokenIdentity(tokenJson.identity);
      } catch {
        setStatus("error");
        setHint("Network error while requesting call token.");
        return;
      }

      try {
        let device = deviceRef.current;
        if (!device) {
          const { Device: TwilioDevice } = await loadTwilioVoiceSdk();
          device = new TwilioDevice(tokenJson.token!, { logLevel: "error" });
          bindDeviceLifecycle(device);
          await device.register();
          deviceRef.current = device;
          setListenState("ready");
        } else {
          device.updateToken(tokenJson.token!);
        }
        setStatus("connecting");
        const call = await device.connect({ params: { To: e164 } });
        attachActiveCallHandlers(call);
      } catch (e) {
        setStatus("error");
        setHint(e instanceof Error ? e.message : "Could not start call.");
      }
    },
    [digits, attachActiveCallHandlers, bindDeviceLifecycle]
  );

  const busy = status === "fetching_token" || status === "connecting" || status === "in_call";
  const canDial = listenState !== "loading" && !incomingCall;

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
      /* eslint-disable react-hooks/purity -- snapshot TTL uses wall clock inside useMemo */
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
      /* eslint-enable react-hooks/purity */
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
      status,
      hint,
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
    incomingCallerUi,
    tokenIdentity,
    ringtoneUnlocked,
    busy,
    canDial,
    incomingCall,
    durationSec,
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
