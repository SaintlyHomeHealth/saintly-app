"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Device, type Call } from "@twilio/voice-sdk";

import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { createRingtoneObjectUrl } from "@/lib/softphone/ringtone-wav";
import { dispatchWorkspaceSoftphoneUi } from "@/lib/softphone/workspace-ui-events";

type CallHandle = Awaited<ReturnType<Device["connect"]>>;

type Ctx = {
  digits: string;
  setDigits: Dispatch<SetStateAction<string>>;
  listenState: "loading" | "ready" | "error";
  status: "idle" | "fetching_token" | "connecting" | "in_call" | "error";
  hint: string | null;
  incomingCallerLabel: string | null;
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
  const [tokenIdentity, setTokenIdentity] = useState<string | null>(null);
  const [ringtoneUnlocked, setRingtoneUnlocked] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [callStartedAtMs, setCallStartedAtMs] = useState<number | null>(null);
  /** Inbound call on AI realtime stream (no Twilio Client leg yet) — from server poll */
  const [inboundAiAssist, setInboundAiAssist] = useState<{ from: string | null } | null>(null);
  const ringtoneUnlockedRef = useRef(false);
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<CallHandle | null>(null);
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const testRingtoneStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (incomingCall) {
      const remote =
        readTwilioParam(incomingCall, ["From", "CallerId", "RemoteNumber"]) ??
        readTwilioParam(incomingCall, ["To"]);
      dispatchWorkspaceSoftphoneUi({ phase: "incoming", remoteLabel: remote });
      return;
    }
    if (status === "in_call") {
      const active = activeCallRef.current;
      const remote =
        readTwilioParam(active, ["To", "From"]) ??
        (digits.trim() ? formatDialpadDisplay(digits) : null);
      dispatchWorkspaceSoftphoneUi({ phase: "active", remoteLabel: remote });
      return;
    }
    if (status === "fetching_token" || status === "connecting") {
      const remote = digits.trim() ? formatDialpadDisplay(digits) : null;
      dispatchWorkspaceSoftphoneUi({ phase: "outbound_ringing", remoteLabel: remote });
      return;
    }
    if (inboundAiAssist) {
      dispatchWorkspaceSoftphoneUi({
        phase: "inbound_ai_assist",
        remoteLabel: inboundAiAssist.from,
      });
      return;
    }
    dispatchWorkspaceSoftphoneUi({ phase: "idle" });
  }, [incomingCall, status, digits, inboundAiAssist]);

  useEffect(() => {
    if (listenState !== "ready") {
      setInboundAiAssist(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/workspace/phone/inbound-active", { credentials: "include" });
        if (cancelled) return;
        if (!res.ok) {
          setInboundAiAssist(null);
          return;
        }
        const j = (await res.json()) as { active?: boolean; from_e164?: string | null };
        if (j.active) {
          setInboundAiAssist({ from: typeof j.from_e164 === "string" ? j.from_e164 : null });
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
        const device = new Device(body.token, { logLevel: "error" });
        device.on("error", (err) => {
          setHint(err.message ?? "Phone error");
        });
        device.on("incoming", (call) => {
          setIncomingCall(call);
          call.on("disconnect", () => setIncomingCall((c) => (c === call ? null : c)));
          call.on("cancel", () => setIncomingCall((c) => (c === call ? null : c)));
        });
        await device.register();
        if (cancelled) {
          device.destroy();
          return;
        }
        deviceRef.current = device;
        setListenState("ready");
      } catch (e) {
        if (!cancelled) {
          setListenState("error");
          setHint(e instanceof Error ? e.message : "Softphone init failed.");
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
  }, []);

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

  const startCall = useCallback(async (toOverride?: string) => {
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
    let tokenJson: { token?: string; identity?: string; error?: string };
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
        device = new Device(tokenJson.token!, { logLevel: "error" });
        device.on("error", (err) => setHint(err.message ?? "Phone error"));
        device.on("incoming", (call) => {
          setIncomingCall(call);
          call.on("disconnect", () => setIncomingCall((c) => (c === call ? null : c)));
          call.on("cancel", () => setIncomingCall((c) => (c === call ? null : c)));
        });
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
  }, [digits, attachActiveCallHandlers]);

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
    const incomingCallerLabel = incomingCall
      ? readTwilioParam(incomingCall, ["From", "CallerId", "RemoteNumber"])
      : null;
    const activeRemoteLabel =
      (status === "in_call" ? readTwilioParam(activeCallRef.current, ["To", "From"]) : null) ??
      (digits.trim() ? formatDialpadDisplay(digits) : null);
    return {
      digits,
      setDigits,
      listenState,
      status,
      hint,
      incomingCallerLabel,
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
