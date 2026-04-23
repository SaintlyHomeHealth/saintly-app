"use client";

import { useState } from "react";

type Props = {
  staffProfileId: string;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
  /** When set, success/error are reported here instead of inline under the button. */
  onResult?: (kind: "ok" | "err", message: string) => void;
};

export function ResendInviteButton({
  staffProfileId,
  disabled = false,
  disabledReason,
  className,
  onResult,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (disabled || loading) return;
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ staffProfileId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string; error?: string };
      if (!res.ok || !data.ok) {
        const text = (data.detail as string) || data.error || "Could not resend invite.";
        if (onResult) onResult("err", text);
        else setErr(text);
        return;
      }
      const okText = "Invite email sent (if SMTP is configured).";
      if (onResult) onResult("ok", okText);
      else setMsg(okText);
    } catch {
      if (onResult) onResult("err", "Network error.");
      else setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  const base =
    "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <span className="inline-flex flex-col gap-0.5">
      <button
        type="button"
        disabled={disabled || loading}
        title={disabled ? disabledReason : undefined}
        onClick={onClick}
        className={className ? `${base} ${className}` : base}
      >
        {loading ? "Sending…" : "Resend invite"}
      </button>
      {onResult ? null : msg ? <span className="text-[10px] text-emerald-700">{msg}</span> : null}
      {onResult ? null : err ? (
        <span className="max-w-[14rem] text-[10px] text-red-700 [overflow-wrap:anywhere]">{err}</span>
      ) : null}
    </span>
  );
}
