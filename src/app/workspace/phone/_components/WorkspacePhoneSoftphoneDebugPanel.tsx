"use client";

import {
  useWorkspaceSoftphone,
  type SoftphoneDebugSnapshot,
} from "@/components/softphone/WorkspaceSoftphoneProvider";

const DEFAULT_DEBUG: SoftphoneDebugSnapshot = {
  tokenLoaded: false,
  tokenIdentity: "",
  identityInInboundRingList: "unknown",
  deviceCreated: false,
  deviceRegistered: false,
  lastDeviceError: "",
  lastIncomingEventAt: "",
};

/** Temporary on-screen Twilio Device diagnostics for `/workspace/phone/keypad`. */
export function WorkspacePhoneSoftphoneDebugPanel() {
  const ctx = useWorkspaceSoftphone();
  const raw = ctx.softphoneDebug;
  const d: SoftphoneDebugSnapshot = raw
    ? {
        tokenLoaded: Boolean(raw.tokenLoaded),
        tokenIdentity: typeof raw.tokenIdentity === "string" ? raw.tokenIdentity : "",
        identityInInboundRingList:
          raw.identityInInboundRingList === "true" || raw.identityInInboundRingList === "false"
            ? raw.identityInInboundRingList
            : "unknown",
        deviceCreated: Boolean(raw.deviceCreated),
        deviceRegistered: Boolean(raw.deviceRegistered),
        lastDeviceError: typeof raw.lastDeviceError === "string" ? raw.lastDeviceError : "",
        lastIncomingEventAt: typeof raw.lastIncomingEventAt === "string" ? raw.lastIncomingEventAt : "",
      }
    : DEFAULT_DEBUG;

  const ring = d.identityInInboundRingList;
  const tokenLoadedLabel = d.tokenLoaded ? "yes" : "no";
  const tokenIdentityLabel = d.tokenIdentity.trim() ? d.tokenIdentity : "(empty)";
  const ringLabel = ring === "unknown" ? "unknown" : ring === "true" ? "true" : "false";
  const deviceCreatedLabel = d.deviceCreated ? "yes" : "no";
  const deviceRegisteredLabel = d.deviceRegistered ? "yes" : "no";
  const lastErrLabel = d.lastDeviceError.trim() ? d.lastDeviceError : "(empty)";
  const lastInLabel = d.lastIncomingEventAt.trim() ? d.lastIncomingEventAt : "(empty)";

  return (
    <div className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-950 p-3 font-mono text-[11px] leading-snug text-amber-50">
      <p className="mb-2 text-sm font-black uppercase tracking-wide text-white">DEBUG PANEL MOUNTED</p>
      <p className="mb-2 font-bold text-amber-300">Softphone debug (temporary)</p>
      <ul className="space-y-0.5 break-all">
        <li>token_loaded: {tokenLoadedLabel}</li>
        <li>token_identity: {tokenIdentityLabel}</li>
        <li>identity_in_inbound_ring_list: {ringLabel}</li>
        <li>device_created: {deviceCreatedLabel}</li>
        <li>device_registered: {deviceRegisteredLabel}</li>
        <li>last_device_error: {lastErrLabel}</li>
        <li>last_incoming_event_at: {lastInLabel}</li>
      </ul>
    </div>
  );
}
