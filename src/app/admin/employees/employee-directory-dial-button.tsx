"use client";

type Props = {
  e164: string;
  className?: string;
};

/**
 * Dispatches the same `softphone:dialTo` event as admin phone / recent calls when a SoftphoneDialer is mounted.
 */
export function EmployeeDirectoryDialButton({ e164, className }: Props) {
  return (
    <button
      type="button"
      className={
        className ??
        "rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
      }
      onClick={() => {
        window.dispatchEvent(new CustomEvent("softphone:dialTo", { detail: { to: e164 } }));
      }}
    >
      Call
    </button>
  );
}
