"use client";

type Props = {
  e164: string;
  label: string;
  className?: string;
};

/**
 * Dispatches `softphone:dialTo` so the workspace softphone dials (same pattern as admin recent calls).
 */
export function DialSoftphoneButton({ e164, label, className }: Props) {
  const phone = e164.trim();
  if (!phone) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.dispatchEvent(new CustomEvent("softphone:dialTo", { detail: { to: phone } }));
      }}
    >
      {label}
    </button>
  );
}
