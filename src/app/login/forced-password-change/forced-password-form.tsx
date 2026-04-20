"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { STAFF_TEMP_PASSWORD_MAX, STAFF_TEMP_PASSWORD_MIN } from "@/lib/admin/staff-auth-shared";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function safeInternalPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/admin";
  }
  return next;
}

export function ForcedPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < STAFF_TEMP_PASSWORD_MIN || password.length > STAFF_TEMP_PASSWORD_MAX) {
      setError(`Use ${STAFF_TEMP_PASSWORD_MIN}–${STAFF_TEMP_PASSWORD_MAX} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) {
        setError(upErr.message);
        return;
      }

      const clear = await fetch("/api/account/clear-require-password-change", {
        method: "POST",
        credentials: "include",
      });
      if (!clear.ok) {
        setError("Password updated, but we could not clear the reset flag. Ask an admin.");
        return;
      }

      const next = safeInternalPath(searchParams.get("next"));
      router.push(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "h-[48px] w-full rounded-2xl border border-[#d9e6f2] bg-white px-4 text-[15px] text-slate-900 outline-none transition focus:border-sky-400/70 focus:ring-4 focus:ring-sky-100";

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>
      ) : null}
      <div>
        <label htmlFor="np" className="block text-xs font-semibold text-slate-700">
          New password
        </label>
        <input
          id="np"
          type="password"
          autoComplete="new-password"
          className={`mt-1 ${inputClass}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={STAFF_TEMP_PASSWORD_MIN}
          maxLength={STAFF_TEMP_PASSWORD_MAX}
          required
        />
      </div>
      <div>
        <label htmlFor="npc" className="block text-xs font-semibold text-slate-700">
          Confirm password
        </label>
        <input
          id="npc"
          type="password"
          autoComplete="new-password"
          className={`mt-1 ${inputClass}`}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full rounded-full bg-slate-900 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
