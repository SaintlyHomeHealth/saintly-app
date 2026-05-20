"use client";

import { useOptionalWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneContext";

type Props = {
  e164: string;
  label: string;
  className?: string;
  /** Secondary button class when “Call via cell” is shown. */
  cellBridgeClassName?: string;
};

function dispatchSoftphoneDial(to: string, viaPstnBridge: boolean) {
  window.dispatchEvent(
    new CustomEvent("softphone:dialTo", { detail: { to, viaPstnBridge } })
  );
}

/**
 * Dispatches `softphone:dialTo` so the workspace softphone dials (browser default, or optional cell bridge).
 */
export function DialSoftphoneButton({ e164, label, className, cellBridgeClassName }: Props) {
  const phone = e164.trim();
  if (!phone) return null;

  const softphone = useOptionalWorkspaceSoftphone();
  const showCellBridge =
    softphone?.softphoneCapabilities?.outbound_pstn_bridge_manual_available === true &&
    softphone?.softphoneCapabilities?.outbound_use_pstn_bridge !== true;

  if (!showCellBridge) {
    return (
      <button type="button" className={className} onClick={() => dispatchSoftphoneDial(phone, false)}>
        {label}
      </button>
    );
  }

  const secondaryCls =
    cellBridgeClassName ??
    "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50";

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={className} onClick={() => dispatchSoftphoneDial(phone, false)}>
        {label}
      </button>
      <button
        type="button"
        className={secondaryCls}
        title="Rings your cell first; press 1 to connect. Better audio on Verizon."
        onClick={() => dispatchSoftphoneDial(phone, true)}
      >
        Via cell
      </button>
    </span>
  );
}
