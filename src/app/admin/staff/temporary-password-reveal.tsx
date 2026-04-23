"use client";

import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Props = {
  staffProfileId: string;
  password: string;
  onDone: () => void;
  /** Dispatch / welcome SMS field from staff_profiles */
  initialSmsNotifyPhone?: string | null;
};

export function TemporaryPasswordReveal({
  staffProfileId,
  password,
  onDone,
  initialSmsNotifyPhone = null,
}: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | "sms" | "email">(null);
  const [phoneInput, setPhoneInput] = useState("");

  useEffect(() => {
    setPhoneInput(formatPhoneNumber(initialSmsNotifyPhone));
  }, [initialSmsNotifyPhone]);

  const hasSavedPhone = normalizePhone(initialSmsNotifyPhone).length >= 10;
  const phoneOk = normalizePhone(phoneInput).length >= 10;

  const copy = useCallback(async () => {
    setErr(null);
    setMsg(null);
    try {
      await navigator.clipboard.writeText(password);
      setMsg("Copied to clipboard.");
    } catch {
      setErr("Could not copy automatically — select the password and copy manually.");
    }
  }, [password]);

  const send = useCallback(
    async (channel: "sms" | "email") => {
      setErr(null);
      setMsg(null);
      setLoading(channel);
      try {
        const body: Record<string, unknown> = {
          staffProfileId,
          temporaryPassword: password,
          channel,
        };
        if (channel === "sms" && !hasSavedPhone && phoneOk) {
          body.smsNotifyPhone = phoneInput;
        }
        const res = await fetch("/api/admin/staff/send-temp-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          detail?: string;
        };
        if (!res.ok || !data.ok) {
          setErr(
            typeof data.detail === "string" && data.detail.trim()
              ? data.detail
              : data.error === "missing_sms_phone"
                ? "No mobile number saved for welcome SMS — add one below, then try again."
                : data.error === "missing_email"
                  ? "Add a work email to this staff member first."
                  : data.error === "email_failed"
                    ? (data.detail as string) || "Email could not be sent."
                    : "Could not send. Try again."
          );
          return;
        }
        setMsg(channel === "sms" ? "SMS sent." : "Email sent.");
        router.refresh();
      } catch {
        setErr("Network error.");
      } finally {
        setLoading(null);
      }
    },
    [staffProfileId, password, hasSavedPhone, phoneOk, phoneInput, router]
  );

  return (
    <div className="rounded-[14px] border-2 border-amber-400/90 bg-amber-50 px-3 py-3 shadow-sm">
      <p className="text-sm font-bold text-amber-950">This password will not be shown again</p>
      <p className="mt-1 text-[11px] leading-snug text-amber-900/90">
        Copy it now, or send it securely to their phone or work email. It cannot be retrieved from this screen later.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          className="w-full min-w-0 flex-1 rounded-[10px] border border-amber-200 bg-white px-2 py-2 font-mono text-sm text-slate-900"
          value={password}
          aria-label="Temporary password"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Copy
        </button>
      </div>
      {!hasSavedPhone ? (
        <div className="mt-3 rounded-[12px] border border-amber-200/80 bg-white/90 px-3 py-2">
          <p className="text-[11px] font-semibold text-amber-950">No mobile number saved for welcome SMS</p>
          <p className="mt-1 text-[10px] text-amber-900/90">
            Add their mobile here to text the password. It is saved to the same Dispatch / welcome field used in Phone
            permissions.
          </p>
          <input
            type="tel"
            autoComplete="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(formatPhoneNumber(e.target.value))}
            className="mt-2 w-full rounded-[10px] border border-amber-200 px-2 py-1.5 text-sm text-slate-900"
            placeholder="(555) 555-5555"
          />
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading !== null || (!hasSavedPhone && !phoneOk)}
          onClick={() => send("sms")}
          className="rounded-full border border-amber-700/30 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100/80 disabled:opacity-50"
        >
          {loading === "sms" ? "Sending…" : "Send via SMS"}
        </button>
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => send("email")}
          className="rounded-full border border-amber-700/30 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100/80 disabled:opacity-50"
        >
          {loading === "email" ? "Sending…" : "Send via email"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-200"
        >
          Done
        </button>
      </div>
      {msg ? <p className="mt-2 text-xs font-medium text-emerald-800">{msg}</p> : null}
      {err ? <p className="mt-2 text-xs text-red-800">{err}</p> : null}
    </div>
  );
}
