"use client";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

/** Temporary on-screen Twilio Device diagnostics for `/workspace/phone/keypad`. */
export function WorkspacePhoneSoftphoneDebugPanel() {
  const { softphoneDebug } = useWorkspaceSoftphone();

  const ring = softphoneDebug.identityInInboundRingList;

  return (
    <div className="mb-4 rounded-lg border border-amber-700/50 bg-amber-950/90 p-3 font-mono text-[11px] leading-snug text-amber-100">
      <p className="mb-1 font-bold text-amber-300">Softphone debug (temporary)</p>
      <ul className="space-y-0.5 break-all">
        <li>token_loaded: {softphoneDebug.tokenLoaded ? "yes" : "no"}</li>
        <li>token_identity: {softphoneDebug.tokenIdentity || "(empty)"}</li>
        <li>
          identity_in_inbound_ring_list: {ring === "unknown" ? "unknown" : ring === "true" ? "true" : "false"}
        </li>
        <li>device_created: {softphoneDebug.deviceCreated ? "yes" : "no"}</li>
        <li>device_registered: {softphoneDebug.deviceRegistered ? "yes" : "no"}</li>
        <li>last_device_error: {softphoneDebug.lastDeviceError || "(empty)"}</li>
        <li>last_incoming_event_at: {softphoneDebug.lastIncomingEventAt || "(empty)"}</li>
      </ul>
    </div>
  );
}
