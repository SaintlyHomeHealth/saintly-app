/**
 * Saintly iOS/Android shell (React Native WebView): route call audio between
 * earpiece and speaker via native Twilio `Voice.getAudioDevices()` — see `mobile`
 * `twilioVoiceService` handlers for `saintly-native-speaker-*` messages.
 * No-ops in desktop browsers.
 */

export function isReactNativeWebViewShell(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { ReactNativeWebView?: { postMessage?: (data: string) => void } }).ReactNativeWebView
      ?.postMessage
  );
}

export function postNativeSpeakerQueryToShell(): void {
  if (typeof window === "undefined") return;
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } })
    .ReactNativeWebView;
  if (!bridge?.postMessage) return;
  try {
    bridge.postMessage(JSON.stringify({ type: "saintly-native-speaker-query" }));
  } catch {
    // ignore
  }
}

export function postNativeSpeakerSetToShell(enabled: boolean): void {
  if (typeof window === "undefined") return;
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } })
    .ReactNativeWebView;
  if (!bridge?.postMessage) return;
  try {
    bridge.postMessage(JSON.stringify({ type: "saintly-native-speaker-set", enabled }));
  } catch {
    // ignore
  }
}

const SPEAKER_STATE_EVENT = "saintly-native-speaker-state";

export function subscribeNativeSpeakerStateFromShell(
  handler: (enabled: boolean) => void
): () => void {
  if (typeof window === "undefined") {
    return (): void => {};
  }
  const listener = (ev: Event): void => {
    const ce = ev as CustomEvent<{ enabled?: boolean }>;
    if (typeof ce.detail?.enabled === "boolean") {
      handler(ce.detail.enabled);
    }
  };
  window.addEventListener(SPEAKER_STATE_EVENT, listener as EventListener);
  return () => window.removeEventListener(SPEAKER_STATE_EVENT, listener as EventListener);
}
