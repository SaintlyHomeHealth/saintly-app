"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function describeSignInError(err: { message: string; code?: string; status?: number }): string {
  const code = (err.code ?? "").toString();
  const msg = (err.message ?? "").toLowerCase();
  if (
    code === "email_not_confirmed" ||
    msg.includes("email not confirmed") ||
    msg.includes("email address not confirmed")
  ) {
    return "Email not confirmed — your account must be confirmed before password sign-in. Ask an admin to use Staff Access (temporary password or Repair link), or complete the invite link from email.";
  }
  if (
    code === "invalid_credentials" ||
    code === "invalid_grant" ||
    msg.includes("invalid login credentials") ||
    msg.includes("invalid email or password")
  ) {
    return "Invalid email or password. Check spelling, caps lock, and that you are using the current password.";
  }
  return err.message || "Could not sign in.";
}

function safeInternalPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/admin";
  }
  return next;
}

function authLoginDebug(label: string, payload: Record<string, unknown>) {
  if (process.env.NEXT_PUBLIC_DEBUG_AUTH_FLOW === "1" || process.env.NODE_ENV === "development") {
    console.log(`[login] ${label}`, payload);
  }
}

/** Text wordmark only — avoids PNG white box and generic icon; matches brand preference. */
function BrandWordmark() {
  return (
    <div className="text-center">
      <p className="text-[1.0625rem] font-bold tracking-[-0.03em] text-slate-900">Saintly</p>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const urlError = searchParams.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserSupabaseClient();
    const redirectTarget = safeInternalPath(searchParams.get("next"));
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      authLoginDebug("signInWithPassword:error", {
        message: signInError.message,
        code: signInError.code ?? null,
        status: signInError.status ?? null,
      });
      setError(describeSignInError(signInError));
      return;
    }

    authLoginDebug("signInWithPassword:ok", {
      userId: signInData.user?.id ?? null,
      email: signInData.user?.email ?? null,
      redirectTarget,
    });

    router.push(redirectTarget);
    router.refresh();
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-[15px] leading-snug text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400/90 focus:border-sky-500/55 focus:shadow-[inset_0_1px_2px_rgba(15,23,42,0.05),0_0_0_3px_rgba(14,165,233,0.12)]";

  return (
    <div className="flex w-full flex-1 flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto flex w-full max-w-[min(100%,19.5rem)] flex-1 flex-col">
        <div className="flex flex-col items-center pt-4 sm:pt-5">
          <BrandWordmark />

          <div className="mt-4 w-full rounded-3xl border border-slate-200/65 bg-white p-5 shadow-[0_16px_40px_-20px_rgba(30,58,138,0.2),0_0_0_1px_rgba(255,255,255,0.85)_inset] sm:p-[1.35rem]">
            <h1 className="text-center text-xl font-bold leading-tight tracking-[-0.025em] text-slate-900">
              Welcome to Saintly
            </h1>
            <p className="mt-1 text-center text-[11.5px] leading-relaxed text-slate-400">
              Sign in to access your dashboard
            </p>

            {urlError === "auth" ? (
              <p className="mt-4 rounded-xl border border-red-200/90 bg-red-50 px-3 py-2 text-sm text-red-800">
                Could not complete sign-in. Try again or contact an administrator.
              </p>
            ) : null}

            <form
              className={`flex flex-col ${urlError === "auth" ? "mt-4" : "mt-5"}`}
              onSubmit={handleSubmit}
            >
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-[0.5625rem] font-medium uppercase tracking-[0.1em] text-slate-400/95"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-[0.5625rem] font-medium uppercase tracking-[0.1em] text-slate-400/95"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {error ? (
                <p className="mt-3 rounded-xl border border-red-200/90 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="mt-5 flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-sky-500 to-blue-800 py-3 text-[15px] font-semibold tracking-wide text-white shadow-[0_3px_12px_-2px_rgba(37,99,235,0.38),0_1px_2px_rgba(15,23,42,0.06)] transition hover:brightness-[1.025] active:brightness-[0.98] disabled:opacity-55"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>

        <div className="min-h-2 flex-1" aria-hidden />
      </div>
    </div>
  );
}
