"use client";

import {
  STAFF_TEMP_PASSWORD_MAX,
  STAFF_TEMP_PASSWORD_MIN,
} from "@/lib/admin/staff-auth-shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";

type Props = {
  staffProfileId: string;
};

type Panel = "menu" | "invite" | "password";

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

export function CreateLoginDialog({ staffProfileId }: Props) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("menu");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [inviteWelcomeSms, setInviteWelcomeSms] = useState(false);
  const [passwordWelcomeSms, setPasswordWelcomeSms] = useState(false);
  const [autoGeneratePassword, setAutoGeneratePassword] = useState(false);
  const [revealedTempPassword, setRevealedTempPassword] = useState<string | null>(null);

  const resetFeedback = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setPanel("menu");
    resetFeedback();
    setPassword("");
    setPasswordConfirm("");
    setLoading(false);
    setInviteWelcomeSms(false);
    setPasswordWelcomeSms(false);
    setAutoGeneratePassword(false);
    setRevealedTempPassword(null);
  }, [resetFeedback]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  function formatError(code: string, detail?: string): string {
    const base = ERROR_LABELS[code] ?? "Something went wrong.";
    const d = typeof detail === "string" && detail.trim() ? ` (${detail.trim()})` : "";
    return base + d;
  }

  async function postInvite() {
    resetFeedback();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff/create-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          staffProfileId,
          mode: "invite",
          sendWelcomeSms: inviteWelcomeSms,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        outcome?: string;
      };

      if (!res.ok || !data.ok) {
        const code = typeof data.error === "string" ? data.error : "request_failed";
        setError(formatError(code, data.detail));
        return;
      }

      setSuccess(
        "Login created and linked. Invite email sent if SMTP is configured; staff email synced from Auth."
      );
      router.refresh();
      setTimeout(() => {
        close();
      }, 1400);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function postTemporaryPassword(e: React.FormEvent) {
    e.preventDefault();
    resetFeedback();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff/create-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          staffProfileId,
          mode: "temporary_password",
          password: autoGeneratePassword ? undefined : password,
          passwordConfirm: autoGeneratePassword ? undefined : passwordConfirm,
          autoGeneratePassword,
          sendWelcomeSms: passwordWelcomeSms,
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
        setError(formatError(code, data.detail));
        return;
      }

      const outcome = data.outcome;
      const temp = typeof data.temporaryPassword === "string" ? data.temporaryPassword : null;
      if (temp) {
        setRevealedTempPassword(temp);
      }
      if (outcome === "login_relinked_existing_auth") {
        setSuccess(
          "Auth user already existed for this email — password updated, staff row relinked, and email synced from Auth."
        );
      } else {
        setSuccess(
          temp
            ? "Login created. Copy the temporary password below now — it cannot be retrieved later."
            : "Login created and linked. Staff email synced from Auth."
        );
      }

      setPassword("");
      setPasswordConfirm("");
      router.refresh();
      if (!temp) {
        setTimeout(() => {
          close();
        }, 1600);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setPanel("menu");
          resetFeedback();
          setPassword("");
          setPasswordConfirm("");
        }}
        className="inline-flex min-w-[7rem] items-center justify-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
      >
        Create login
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
            {panel === "menu" ? (
              <>
                <h2 id={titleId} className="text-base font-bold text-slate-900">
                  Create login
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Choose how to provision Supabase Auth for this staff row. No internal IDs are shown.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50"
                    onClick={() => {
                      resetFeedback();
                      setPanel("invite");
                    }}
                  >
                    Send invite
                    <span className="mt-0.5 block text-xs font-normal text-slate-600">
                      Email link to sign in (recommended)
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50"
                    onClick={() => {
                      resetFeedback();
                      setPanel("password");
                    }}
                  >
                    Create with temporary password
                    <span className="mt-0.5 block text-xs font-normal text-slate-600">
                      Set a password now; they sign in immediately
                    </span>
                  </button>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}

            {panel === "invite" ? (
              <>
                <h2 id={titleId} className="text-base font-bold text-slate-900">
                  Send invite
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Sends an invite email (or creates the auth user), then links this row and syncs email from Auth.
                </p>
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
                <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={inviteWelcomeSms}
                    onChange={(e) => setInviteWelcomeSms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  Also send welcome SMS with login link (uses Dispatch / welcome # on this staff row)
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setPanel("menu")}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={loading || !!success}
                    onClick={postInvite}
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {loading ? "Sending…" : "Send invite"}
                  </button>
                </div>
              </>
            ) : null}

            {panel === "password" ? (
              <>
                <h2 id={titleId} className="text-base font-bold text-slate-900">
                  Temporary password
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Creates or reuses the Auth user for this email, updates password if they already exist, then links
                  and syncs staff_profiles (including email from Auth).
                </p>
                <form onSubmit={postTemporaryPassword} className="mt-4 space-y-3">
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
                    <div className="rounded-[12px] border border-amber-200 bg-amber-50/90 px-3 py-2">
                      <p className="text-[11px] font-semibold text-amber-950">Temporary password (copy now)</p>
                      <div className="mt-2 flex gap-2">
                        <input
                          readOnly
                          className="w-full rounded-[10px] border border-amber-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900"
                          value={revealedTempPassword}
                        />
                        <button
                          type="button"
                          className="shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white"
                          onClick={() => navigator.clipboard.writeText(revealedTempPassword)}
                        >
                          Copy
                        </button>
                      </div>
                      <button
                        type="button"
                        className="mt-2 text-[11px] font-semibold text-amber-950 underline"
                        onClick={close}
                      >
                        Done
                      </button>
                    </div>
                  ) : null}
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoGeneratePassword}
                      onChange={(e) => {
                        setAutoGeneratePassword(e.target.checked);
                        resetFeedback();
                      }}
                      className="mt-0.5 rounded border-slate-300"
                    />
                    Generate secure password on server (recommended — shown once after save)
                  </label>
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={passwordWelcomeSms}
                      onChange={(e) => setPasswordWelcomeSms(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300"
                    />
                    Send welcome SMS with login link after creating login
                  </label>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">Temporary password</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={autoGeneratePassword}
                      className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                      placeholder={`${STAFF_TEMP_PASSWORD_MIN}–${STAFF_TEMP_PASSWORD_MAX} chars; digits OK`}
                      minLength={STAFF_TEMP_PASSWORD_MIN}
                      maxLength={STAFF_TEMP_PASSWORD_MAX}
                      required={!autoGeneratePassword}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700">Confirm password</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      disabled={autoGeneratePassword}
                      className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                      required={!autoGeneratePassword}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={autoGeneratePassword}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
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
                      disabled={autoGeneratePassword}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
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
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPanel("menu");
                        resetFeedback();
                        setPassword("");
                        setPasswordConfirm("");
                      }}
                      className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !!success || !!revealedTempPassword}
                      className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {loading ? "Creating…" : "Create login"}
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
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
