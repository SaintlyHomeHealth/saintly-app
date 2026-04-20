"use client";

import { useCallback, useState } from "react";

type Props = {
  staffProfileId: string;
  loginUrl: string;
  hasLogin: boolean;
};

export function StaffCommunicationBar({ staffProfileId, loginUrl, hasLogin }: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const copyLogin = useCallback(async () => {
    setErr(null);
    setMsg(null);
    try {
      await navigator.clipboard.writeText(loginUrl);
      setMsg("Login link copied.");
    } catch {
      setErr("Could not copy — copy manually.");
    }
  }, [loginUrl]);

  async function postJson(url: string, body: object) {
    setErr(null);
    setMsg(null);
    setLoading(url);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || !data.ok) {
        setErr((data.detail as string) || data.error || "Request failed");
        return;
      }
      setMsg("Sent.");
    } catch {
      setErr("Network error.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="rounded-[16px] border border-slate-100 bg-slate-50/50 p-3">
      <p className="text-xs font-semibold text-slate-700">Communication</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyLogin}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          Copy login URL
        </button>
        {hasLogin ? (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => postJson("/api/admin/staff/resend-invite", { staffProfileId })}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading === "/api/admin/staff/resend-invite" ? "Sending…" : "Resend invite email"}
          </button>
        ) : null}
        {hasLogin ? (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() =>
              postJson("/api/admin/staff/send-access-sms", { staffProfileId, variant: "welcome" })
            }
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading === "/api/admin/staff/send-access-sms" ? "Sending…" : "Send welcome SMS"}
          </button>
        ) : null}
      </div>
      {msg ? <p className="mt-2 text-xs text-emerald-800">{msg}</p> : null}
      {err ? <p className="mt-2 text-xs text-red-800">{err}</p> : null}
    </div>
  );
}
