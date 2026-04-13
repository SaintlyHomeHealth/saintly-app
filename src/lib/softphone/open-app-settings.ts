/**
 * Best-effort open iOS/Android app settings from the workspace softphone (browser / WebView).
 * In the Saintly native shell, `ReactNativeWebView.postMessage` is handled to call `Linking.openSettings()`.
 */
export function openSoftphoneAppSettings(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  };
  if (w.ReactNativeWebView?.postMessage) {
    try {
      w.ReactNativeWebView.postMessage(JSON.stringify({ type: "open-settings" }));
    } catch {
      // noop
    }
    return;
  }
  try {
    window.location.href = "app-settings:";
  } catch {
    // noop
  }
}
