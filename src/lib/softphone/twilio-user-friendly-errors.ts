/**
 * Maps Twilio Voice JS SDK / WebRTC errors to staff-safe copy.
 * Always log the raw error server- or client-side for debugging.
 */

export type FriendlyCallError = {
  /** Shown in the UI */
  userMessage: string;
  /** True when the user should open system Settings (mic permission, etc.) */
  suggestOpenSettings: boolean;
  /** True when retrying the same action may succeed */
  canRetry: boolean;
};

function hasCode(e: unknown, code: number): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === code;
}

function str(e: unknown): string {
  if (e instanceof Error) return `${e.name} ${e.message}`;
  if (typeof e === "object" && e !== null && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return String(e);
}

/**
 * Normalize Twilio/device errors for keypad / softphone surfaces.
 */
export function twilioErrorToFriendly(e: unknown): FriendlyCallError {
  const raw = str(e);
  const lower = raw.toLowerCase();

  if (hasCode(e, 31402) || lower.includes("acquisitionfailed") || lower.includes("31402")) {
    return {
      userMessage:
        "Microphone access is required to place and receive calls. Allow the microphone for this app in Settings, then try again.",
      suggestOpenSettings: true,
      canRetry: true,
    };
  }

  if (hasCode(e, 31208) || lower.includes("permissiondenied") || lower.includes("notallowederror")) {
    return {
      userMessage: "Microphone access was blocked. Enable it in Settings to use the phone.",
      suggestOpenSettings: true,
      canRetry: true,
    };
  }

  if (lower.includes("network") || lower.includes("offline") || lower.includes("failed to fetch")) {
    return {
      userMessage: "Network issue while connecting. Check your connection and try again.",
      suggestOpenSettings: false,
      canRetry: true,
    };
  }

  if (lower.includes("token") && (lower.includes("invalid") || lower.includes("expired"))) {
    return {
      userMessage: "Your phone session expired. Refresh the page and sign in again if this continues.",
      suggestOpenSettings: false,
      canRetry: true,
    };
  }

  return {
    userMessage: "We couldn’t start the call. Check permissions and your connection, then try again.",
    suggestOpenSettings: false,
    canRetry: true,
  };
}
