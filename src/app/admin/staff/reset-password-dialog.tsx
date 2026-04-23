"use client";

import { STAFF_TEMP_PASSWORD_MAX, STAFF_TEMP_PASSWORD_MIN } from "@/lib/admin/staff-auth-shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";

import { TemporaryPasswordReveal } from "./temporary-password-reveal";

type Props = {
  staffProfileId: string;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  /** Opens with “generate on server” checked (Regenerate temporary password). */
  defaultAutoGenerate?: boolean;
  triggerLabel?: string;
  dialogTitle?: string;
  /** Full override for the trigger button classes (e.g. overflow menu row). */
  triggerClassName?: string;
  /** Fires after reset-password API completes (for toast outside the modal). */
  onApiResult?: (kind: "ok" | "err", message: string) => void;
};

const ERROR_LABELS: Record<string, string> = {
  forbidden: "You do not have permission.",
  missing_staff_profile_id: "Invalid request.",
  load_failed: "Could not load the staff record.",
  no_login_to_reset: "This row has no login yet — use Create login instead.",
  password_mismatch: "Passwords do not match.",
  password_requirements: `Use ${STAFF_TEMP_PASSWORD_MIN}–${STAFF_TEMP_PASSWORD_MAX} characters.`,
  auth_update_failed: "Supabase could not update the password.",
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
  const all = upper + lower + nums;
  const length = 12;
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  const out: string[] = [];
  out.push(upper[buf[0] % upper.length]);
  out.push(lower[buf[1] % lower.length]);
  out.push(nums[buf[2] % nums.length]);
  for (let i = 3; i < length; i++) {
    out.push(all[buf[i] % all.length]);
  }
  return out.join("");
}

export function ResetPasswordDialog({
  staffProfileId,
  disabled = false,
  disabledReason = "Create a login for this person first.",
  compact = false,
  defaultAutoGenerate = false,
  triggerLabel = "Reset password",
  dialogTitle,
  triggerClassName,
  onApiResult,
}: Props) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [autoGenerate, setAutoGenerate] = useState(defaultAutoGenerate);
  const [revealedTempPassword, setRevealedTempPassword] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setSuccess(null);
    setPassword("");
    setPasswordConfirm("");
    setLoading(false);
    setAutoGenerate(defaultAutoGenerate);
    setRevealedTempPassword(null);
  }, [defaultAutoGenerate]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          staffProfileId,
          password: autoGenerate ? undefined : password,
          passwordConfirm: autoGenerate ? undefined : passwordConfirm,
          autoGenerate,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        outcome?: string;
        temporaryPassword?: string;
      };

      if (!res.ok || !data.ok) {
        const code = typeof data.error === "string" ? data.error : "request_failed";
        const base = ERROR_LABELS[code] ?? "Something went wrong.";
        const detail = typeof data.detail === "string" && data.detail ? ` (${data.detail})` : "";
        const msg = base + detail;
        setError(msg);
        onApiResult?.("err", msg);
        return;
      }

      const temp = typeof data.temporaryPassword === "string" ? data.temporaryPassword : null;
      if (temp) {
        setRevealedTempPassword(temp);
        const msg = "Password reset. Copy the new temporary password below — it cannot be retrieved later.";
        setSuccess(msg);
        onApiResult?.("ok", msg);
      } else {
        const msg = "Password reset successful. Share the new temporary password securely.";
        setSuccess(msg);
        onApiResult?.("ok", msg);
      }
      setPassword("");
      setPasswordConfirm("");
      router.refresh();
      if (!temp) {
        setTimeout(() => close(), 1600);
      }
    } catch {
      const msg = "Network error. Try again.";
      setError(msg);
      onApiResult?.("err", msg);
    } finally {
      setLoading(false);
    }
  }

  const heading = dialogTitle ?? (defaultAutoGenerate ? "Regenerate temporary password" : "Reset password");
  const triggerClass =
    triggerClassName ??
    (compact
      ? "inline-flex min-w-0 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
      : "inline-flex min-w-[7rem] items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45");

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          setError(null);
          setSuccess(null);
          setPassword("");
          setPasswordConfirm("");
          setAutoGenerate(defaultAutoGenerate);
        }}
        className={triggerClass}
      >
        {triggerLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-[24px] border border-indigo-100/90 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="text-base font-bold text-slate-900">
              {heading}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {defaultAutoGenerate
                ? "A new temporary password will be generated on the server and shown once. The staff member may be asked to change it at next sign-in."
                : "Sets a new password on the linked Supabase Auth user. If you generate a password on the server, it is shown only once in this window."}
            </p>
            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              {error ? (
                <p className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  {success}
                </p>
              ) : null}
              {revealedTempPassword ? (
                <TemporaryPasswordReveal
                  staffProfileId={staffProfileId}
                  password={revealedTempPassword}
                  onDone={close}
                />
              ) : null}
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={autoGenerate}
                  onChange={(e) => {
                    setAutoGenerate(e.target.checked);
                    setError(null);
                  }}
                  className="mt-0.5 rounded border-slate-300"
                />
                Generate on server (shown once)
              </label>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">New temporary password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={autoGenerate}
                  className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                  placeholder={`${STAFF_TEMP_PASSWORD_MIN}–${STAFF_TEMP_PASSWORD_MAX} characters (digits OK)`}
                  minLength={STAFF_TEMP_PASSWORD_MIN}
                  maxLength={STAFF_TEMP_PASSWORD_MAX}
                  required={!autoGenerate}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700">Confirm password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  disabled={autoGenerate}
                  className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                  required={!autoGenerate}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={autoGenerate}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => {
                    const g = generateNumericSix();
                    setPassword(g);
                    setPasswordConfirm(g);
                    setError(null);
                  }}
                >
                  Generate 6-digit
                </button>
                <button
                  type="button"
                  disabled={autoGenerate}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => {
                    const g = generateMixedTemp();
                    setPassword(g);
                    setPasswordConfirm(g);
                    setError(null);
                  }}
                >
                  Generate mixed
                </button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="submit"
                  disabled={loading || !!success || !!revealedTempPassword}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {loading ? "Saving…" : "Save password"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
