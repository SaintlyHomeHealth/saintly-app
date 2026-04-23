"use client";

import {
  STAFF_TEMP_PASSWORD_MAX,
  STAFF_TEMP_PASSWORD_MIN,
} from "@/lib/admin/staff-auth-shared";
import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { TemporaryPasswordReveal } from "./temporary-password-reveal";

type SignInMethod = "invite" | "temporary_password";

type Props = {
  staffProfileId: string;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  triggerClassName?: string;
  onApiResult?: (kind: "ok" | "err", message: string) => void;
  onBeforeOpen?: () => void;
  initialEmail?: string | null;
  initialSmsNotifyPhone?: string | null;
};

const ERROR_LABELS: Record<string, string> = {
  forbidden: "You do not have permission.",
  missing_staff_profile_id: "Invalid request.",
  missing_email: "Add a work email before creating a login.",
  already_has_login: "This person already has a login.",
  load_failed: "Could not load the staff record.",
  auth_provision_failed: "Supabase Auth could not create or invite the user.",
  link_failed: "Auth user exists but updating staff_profiles failed.",
  password_mismatch: "Passwords do not match.",
  password_requirements: `Use ${STAFF_TEMP_PASSWORD_MIN}–${STAFF_TEMP_PASSWORD_MAX} characters (digits-only OK).`,
  auth_user_linked_elsewhere: "That auth account is already linked to another staff row.",
  auth_user_load_failed: "Could not load the auth user to sync email.",
  auth_user_missing_email: "Auth user has no email on file.",
  missing_sms_phone: "Enter a valid mobile number (10+ digits) to send SMS, or turn off SMS delivery.",
  phone_save_failed: "Could not save the mobile number. Try again.",
};

function generateNumericSix(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

function generateMixedTemp(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const nums = "23456789";
  const sym = "!@#$%&*";
  const all = upper + lower + nums + sym;
  const length = 16;
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  const out: string[] = [];
  out.push(upper[buf[0] % upper.length]);
  out.push(lower[buf[1] % lower.length]);
  out.push(nums[buf[2] % nums.length]);
  out.push(sym[buf[3] % sym.length]);
  for (let i = 4; i < length; i++) {
    out.push(all[buf[i] % all.length]);
  }
  return out.join("");
}

export function CreateLoginDialog({
  staffProfileId,
  disabled = false,
  disabledReason = "This person already has a login. Use Reset password to change it.",
  compact = false,
  triggerClassName,
  onApiResult,
  onBeforeOpen,
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
  const [method, setMethod] = useState<SignInMethod>("invite");
  const [inviteAlsoSms, setInviteAlsoSms] = useState(false);
  const [tempDeliverEmail, setTempDeliverEmail] = useState(true);
  const [tempDeliverSms, setTempDeliverSms] = useState(false);
  const [autoGeneratePassword, setAutoGeneratePassword] = useState(true);
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [revealedTempPassword, setRevealedTempPassword] = useState<string | null>(null);

  const resetFeedback = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    resetFeedback();
    setLoading(false);
    setPhoneInput("");
    setMethod("invite");
    setInviteAlsoSms(false);
    setTempDeliverEmail(true);
    setTempDeliverSms(false);
    setAutoGeneratePassword(true);
    setRequirePasswordChange(true);
    setPassword("");
    setPasswordConfirm("");
    setRevealedTempPassword(null);
  }, [resetFeedback]);

  useEffect(() => {
    if (!open) return;
    setPhoneInput(formatPhoneNumber(initialSmsNotifyPhone));
    setMethod("invite");
    setInviteAlsoSms(false);
    setTempDeliverEmail(true);
    setTempDeliverSms(false);
    setAutoGeneratePassword(true);
    setRequirePasswordChange(true);
    setPassword("");
    setPasswordConfirm("");
    resetFeedback();
    setRevealedTempPassword(null);
  }, [open, initialSmsNotifyPhone, resetFeedback]);

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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function formatError(code: string, detail?: string): string {
    const base = ERROR_LABELS[code] ?? "Something went wrong.";
    const d = typeof detail === "string" && detail.trim() ? ` (${detail.trim()})` : "";
    return base + d;
  }

  function validatePhoneForSms(): boolean {
    return normalizePhone(phoneInput).length >= 10;
  }

  async function submitCreate() {
    resetFeedback();
    const emailNorm = (initialEmail ?? "").trim();
    if (!emailNorm) {
      const msg = ERROR_LABELS.missing_email;
      setError(msg);
      onApiResult?.("err", msg);
      return;
    }

    if (method === "invite") {
      if (inviteAlsoSms && !validatePhoneForSms()) {
        const msg = ERROR_LABELS.missing_sms_phone;
        setError(msg);
        onApiResult?.("err", msg);
        return;
      }
    } else {
      if (tempDeliverSms && !validatePhoneForSms()) {
        const msg = ERROR_LABELS.missing_sms_phone;
        setError(msg);
        onApiResult?.("err", msg);
        return;
      }
      if (tempDeliverEmail && !emailNorm) {
        const msg = ERROR_LABELS.missing_email;
        setError(msg);
        onApiResult?.("err", msg);
        return;
      }
      if (!autoGeneratePassword) {
        if (password.length < STAFF_TEMP_PASSWORD_MIN || password.length > STAFF_TEMP_PASSWORD_MAX) {
          const msg = ERROR_LABELS.password_requirements;
          setError(msg);
          onApiResult?.("err", msg);
          return;
        }
        if (password !== passwordConfirm) {
          const msg = ERROR_LABELS.password_mismatch;
          setError(msg);
          onApiResult?.("err", msg);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff/create-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          staffProfileId,
          mode: method,
          smsNotifyPhone: phoneInput,
          deliverSms: method === "invite" ? inviteAlsoSms : tempDeliverSms,
          deliverEmail: method === "temporary_password" ? tempDeliverEmail : undefined,
          autoGeneratePassword: method === "temporary_password" ? autoGeneratePassword : undefined,
          password: method === "temporary_password" && !autoGeneratePassword ? password : undefined,
          passwordConfirm: method === "temporary_password" && !autoGeneratePassword ? passwordConfirm : undefined,
          requirePasswordChange: method === "temporary_password" ? requirePasswordChange : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        outcome?: string;
        temporaryPassword?: string;
        delivery?: { emailSent?: boolean; smsSent?: boolean; emailError?: string; smsError?: string };
      };

      if (!res.ok || !data.ok) {
        const code = typeof data.error === "string" ? data.error : "request_failed";
        const msg = formatError(code, data.detail);
        setError(msg);
        onApiResult?.("err", msg);
        return;
      }

      const deliveryNote = (() => {
        const d = data.delivery;
        if (!d) return "";
        const parts: string[] = [];
        if (d.emailSent) parts.push("Credentials emailed.");
        if (d.smsSent) parts.push("SMS sent.");
        if (d.emailError) parts.push(`Email not sent: ${d.emailError}`);
        if (d.smsError) parts.push(`SMS not sent: ${d.smsError}`);
        return parts.length ? ` ${parts.join(" ")}` : "";
      })();

      if (method === "invite") {
        const okMsg =
          "Login created and linked. Supabase sends the invite to their work email." + deliveryNote;
        setSuccess(okMsg);
        onApiResult?.("ok", okMsg);
        router.refresh();
        setTimeout(() => close(), 1800);
        return;
      }

      const temp = typeof data.temporaryPassword === "string" ? data.temporaryPassword : null;
      if (temp) {
        setRevealedTempPassword(temp);
      }
      const outcome = data.outcome;
      let okMsg: string;
      if (outcome === "login_relinked_existing_auth") {
        okMsg =
          "Auth user already existed for this email — password updated, staff row relinked." + deliveryNote;
      } else {
        okMsg = temp
          ? "Login created." + deliveryNote + " Copy the password below if you did not send it by email/SMS."
          : "Login created and linked." + deliveryNote;
      }
      setSuccess(okMsg);
      onApiResult?.("ok", okMsg);
      setPassword("");
      setPasswordConfirm("");
      router.refresh();
      if (!temp) {
        setTimeout(() => close(), 2000);
      }
    } catch {
      const msg = "Network error. Try again.";
      setError(msg);
      onApiResult?.("err", msg);
    } finally {
      setLoading(false);
    }
  }

  const triggerClass = triggerClassName
    ? triggerClassName
    : compact
      ? "inline-flex min-w-0 items-center justify-center rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
      : "inline-flex min-w-[7rem] items-center justify-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45";

  const workEmailDisplay = (initialEmail ?? "").trim() || "—";

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
            Create login
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Provisions Supabase Auth and saves the mobile number on this staff row for welcome texts and dispatch alerts
            (same field as Phone permissions).
          </p>

          <div className="mt-4 space-y-3 rounded-[16px] border border-slate-100 bg-slate-50/80 p-3">
            <div>
              <p className="text-[11px] font-semibold text-slate-600">Work email</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900 [overflow-wrap:anywhere]">{workEmailDisplay}</p>
            </div>
            <label className="block text-[11px] font-semibold text-slate-700">
              Mobile for welcome / dispatch SMS
              <input
                type="tel"
                autoComplete="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(formatPhoneNumber(e.target.value))}
                className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="(555) 555-5555"
              />
              <span className="mt-1 block text-[10px] font-normal text-slate-500">
                Saved to this staff row when you submit. Used for onboarding texts and dispatch alerts.
              </span>
            </label>
          </div>

          <fieldset className="mt-4 space-y-2">
            <legend className="text-[11px] font-semibold text-slate-700">How they sign in</legend>
            <label className="flex cursor-pointer items-start gap-2 rounded-[14px] border border-slate-200 bg-white p-3 text-sm has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/40">
              <input
                type="radio"
                name="signin-method"
                className="mt-1"
                checked={method === "invite"}
                onChange={() => setMethod("invite")}
              />
              <span>
                <span className="font-semibold text-slate-900">Email invite</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-600">
                  Supabase emails a sign-in link to their work address (recommended).
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-[14px] border border-slate-200 bg-white p-3 text-sm has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/40">
              <input
                type="radio"
                name="signin-method"
                className="mt-1"
                checked={method === "temporary_password"}
                onChange={() => setMethod("temporary_password")}
              />
              <span>
                <span className="font-semibold text-slate-900">Temporary password</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-600">
                  They sign in immediately with a password you share (copy, email, or SMS).
                </span>
              </span>
            </label>
          </fieldset>

          {method === "invite" ? (
            <div className="mt-4 space-y-2 rounded-[14px] border border-slate-100 bg-white p-3">
              <p className="text-[11px] font-semibold text-slate-700">Delivery</p>
              <p className="text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Email:</span> invite message is sent automatically by
                Supabase to <span className="font-medium">{workEmailDisplay}</span>.
              </p>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300"
                  checked={inviteAlsoSms}
                  onChange={(e) => setInviteAlsoSms(e.target.checked)}
                />
                Also send a welcome text with the sign-in link (uses mobile number above)
              </label>
            </div>
          ) : (
            <div className="mt-4 space-y-3 rounded-[14px] border border-slate-100 bg-white p-3">
              <p className="text-[11px] font-semibold text-slate-700">Deliver temporary password</p>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300"
                  checked={tempDeliverEmail}
                  onChange={(e) => setTempDeliverEmail(e.target.checked)}
                />
                Send password by email (Resend / work email)
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300"
                  checked={tempDeliverSms}
                  onChange={(e) => setTempDeliverSms(e.target.checked)}
                />
                Send password by SMS (uses mobile number above)
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300"
                  checked={autoGeneratePassword}
                  onChange={(e) => {
                    setAutoGeneratePassword(e.target.checked);
                    resetFeedback();
                  }}
                />
                Generate secure password on server (recommended)
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300"
                  checked={requirePasswordChange}
                  onChange={(e) => setRequirePasswordChange(e.target.checked)}
                />
                Require password change on first sign-in
              </label>
              {!autoGeneratePassword ? (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">Temporary password</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm"
                      minLength={STAFF_TEMP_PASSWORD_MIN}
                      maxLength={STAFF_TEMP_PASSWORD_MAX}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">Confirm</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                      onClick={() => {
                        const g = generateNumericSix();
                        setPassword(g);
                        setPasswordConfirm(g);
                        resetFeedback();
                      }}
                    >
                      Generate 6-digit
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                      onClick={() => {
                        const g = generateMixedTemp();
                        setPassword(g);
                        setPasswordConfirm(g);
                        resetFeedback();
                      }}
                    >
                      Generate mixed
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}

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
          {revealedTempPassword ? (
            <div className="mt-3">
              <TemporaryPasswordReveal
                staffProfileId={staffProfileId}
                password={revealedTempPassword}
                onDone={close}
                initialSmsNotifyPhone={
                  normalizePhone(phoneInput).length >= 10 ? phoneInput : initialSmsNotifyPhone
                }
              />
            </div>
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
              disabled={loading || !!success || !!revealedTempPassword}
              onClick={submitCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Working…" : method === "invite" ? "Create login & send invite" : "Create login"}
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
        onClick={() => {
          if (disabled) return;
          onBeforeOpen?.();
          setOpen(true);
        }}
        className={triggerClass}
      >
        Create login
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </div>
  );
}
