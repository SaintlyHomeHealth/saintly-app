"use client";

import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = {
  staffProfileId: string;
  disabled?: boolean;
  disabledReason?: string;
  initialEmail?: string | null;
  initialSmsNotifyPhone?: string | null;
};

export function ResendInviteDialog({
  staffProfileId,
  disabled = false,
  disabledReason,
  initialEmail = null,
  initialSmsNotifyPhone = null,
}: Props) {
  const router = useRouter();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [alsoSms, setAlsoSms] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setSuccess(null);
    setLoading(false);
    setAlsoSms(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPhoneInput(formatPhoneNumber(initialSmsNotifyPhone));
    setAlsoSms(false);
    setError(null);
    setSuccess(null);
  }, [open, initialSmsNotifyPhone]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function submit() {
    setError(null);
    setSuccess(null);
    if (alsoSms && normalizePhone(phoneInput).length < 10) {
      setError("Enter a valid mobile number to send the welcome text, or turn off SMS.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          staffProfileId,
          smsNotifyPhone: phoneInput,
          sendWelcomeSms: alsoSms,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        delivery?: { smsSent?: boolean; smsError?: string };
      };
      if (!res.ok || !data.ok) {
        setError(
          (data.detail as string) ||
            (data.error === "missing_sms_phone"
              ? "Enter a valid mobile number to send the welcome text, or turn off SMS."
              : data.error) ||
            "Could not resend invite."
        );
        return;
      }
      const d = data.delivery;
      const extra =
        alsoSms && d
          ? d.smsSent
            ? " Welcome text sent."
            : d.smsError
              ? ` SMS not sent: ${d.smsError}`
              : ""
          : "";
      setSuccess("Invite email sent (if SMTP is configured)." + extra);
      router.refresh();
      setTimeout(() => close(), 2200);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  const workEmail = (initialEmail ?? "").trim() || "—";

  const modal =
    open && typeof document !== "undefined" ? (
      <div
        className="fixed inset-0 z-[130] flex max-h-[100dvh] items-end justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center sm:p-6"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="my-auto w-full max-w-md rounded-[24px] border border-indigo-100/90 bg-white p-5 shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 id={titleId} className="text-base font-bold text-slate-900">
            Resend invite & access
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Sends another Supabase invite to their work email. Optionally text them a sign-in link — uses the same
            mobile field as Dispatch / welcome SMS.
          </p>
          <div className="mt-3 rounded-[14px] border border-slate-100 bg-slate-50/80 p-3 text-xs">
            <p>
              <span className="font-semibold text-slate-700">Work email:</span>{" "}
              <span className="text-slate-900 [overflow-wrap:anywhere]">{workEmail}</span>
            </p>
          </div>
          <label className="mt-3 block text-[11px] font-semibold text-slate-700">
            Mobile for welcome SMS
            <input
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(formatPhoneNumber(e.target.value))}
              className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="(555) 555-5555"
            />
            <span className="mt-1 block text-[10px] font-normal text-slate-500">
              Saved to this staff row when you submit. Required if you enable the text below.
            </span>
          </label>
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={alsoSms}
              onChange={(e) => setAlsoSms(e.target.checked)}
            />
            Also send welcome text with sign-in link
          </label>
          {error ? (
            <p className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="mt-3 rounded-[12px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              {success}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading || !!success}
              onClick={submit}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send invite"}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-1">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Resend invite
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </div>
  );
}
