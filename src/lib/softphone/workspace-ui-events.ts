/**
 * Browser-only events so workspace UI (e.g. a future global call dock) can reflect
 * softphone phase without coupling to Twilio types. Emitted from `SoftphoneDialer`.
 */
export const WORKSPACE_SOFTPHONE_UI_EVENT = "workspace:softphoneUi";

export type WorkspaceSoftphoneUiPhase =
  | "idle"
  | "incoming"
  /** PSTN inbound on AI realtime stream — browser Client not ringing yet */
  | "inbound_ai_assist"
  | "outbound_ringing"
  | "active";

export type WorkspaceSoftphoneUiDetail = {
  phase: WorkspaceSoftphoneUiPhase;
  /** E.164 or Twilio param when available */
  remoteLabel?: string | null;
};

export function dispatchWorkspaceSoftphoneUi(detail: WorkspaceSoftphoneUiDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WORKSPACE_SOFTPHONE_UI_EVENT, { detail }));
}

/**
 * Fire when the AI realtime stream / transfer flow ends on the client (e.g. future WS hook) so the
 * workspace can clear `inbound_ai_assist` without waiting for `/inbound-active` to catch up.
 */
export const WORKSPACE_SOFTPHONE_FORCE_CLEAR_EVENT = "workspace:softphoneForceClear";

export type WorkspaceSoftphoneForceClearDetail = {
  reason?: string;
};

export function dispatchWorkspaceSoftphoneForceClear(detail: WorkspaceSoftphoneForceClearDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WORKSPACE_SOFTPHONE_FORCE_CLEAR_EVENT, { detail }));
}
