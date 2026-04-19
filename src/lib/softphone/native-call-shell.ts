/**
 * React Native WebView shell: Twilio Voice runs natively; WebView is UI-only for calls.
 * Native injects `saintly-native-call-to-web` events; the page posts `saintly-native-call` to RN.
 */

export const NATIVE_CALL_TO_WEB_EVENT = "saintly-native-call-to-web";

export type NativeCallToWebDetail =
  | {
      kind: "incoming_ring";
      callId: string;
      from?: string;
      to?: string;
      customParameters?: Record<string, string>;
    }
  | { kind: "call_connected"; callId: string; direction: "inbound" | "outbound" }
  | { kind: "call_disconnected"; callId: string }
  | { kind: "mute_changed"; muted: boolean }
  | { kind: "speaker_changed"; enabled: boolean };

/** Web → React Native: request native call control (no Twilio JS on the page in shell mode). */
export type NativeCallFromWebPayload = {
  action: "start_call" | "answer_call" | "decline_call" | "hangup" | "mute" | "dtmf";
  /** PSTN / E.164 destination for outbound. */
  toE164?: string;
  /** `block` or a specific outbound line E.164; omitted = default line from token/TwiML. */
  outboundCli?: "block" | string;
  /** Twilio Client leg CallSid (invite or active call). */
  callId?: string;
  muted?: boolean;
  digits?: string;
};

export function postNativeCallControlToReactNative(msg: NativeCallFromWebPayload): void {
  if (typeof window === "undefined") return;
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } })
    .ReactNativeWebView;
  if (!bridge?.postMessage) return;
  try {
    const payload = JSON.stringify({ type: "saintly-native-call", ...msg });
    bridge.postMessage(payload);
  } catch {
    /* ignore */
  }
}

export function subscribeNativeCallToWeb(handler: (d: NativeCallToWebDetail) => void): () => void {
  if (typeof window === "undefined") {
    return (): void => {};
  }
  const listener = (ev: Event): void => {
    const ce = ev as CustomEvent<NativeCallToWebDetail>;
    if (ce.detail && typeof ce.detail.kind === "string") {
      handler(ce.detail);
    }
  };
  window.addEventListener(NATIVE_CALL_TO_WEB_EVENT, listener as EventListener);
  return () => window.removeEventListener(NATIVE_CALL_TO_WEB_EVENT, listener as EventListener);
}
