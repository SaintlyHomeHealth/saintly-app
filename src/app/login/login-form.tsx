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

/** Transparent vector mark — avoids white-box PNG artifact in WebView / mobile. */
function BrandMark() {
  return (
    <div className="relative flex flex-col items-center">
      <div
        className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-white/75 shadow-[0_12px_40px_-8px_rgba(30,64,175,0.2),0_0_0_1px_rgba(255,255,255,0.9)_inset] ring-1 ring-sky-100/80 backdrop-blur-md"
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local SVG; transparent, no raster box */}
        <img
          src="/brand/saintly-icon-master.svg"
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 object-contain"
        />
      </div>
      <div className="mt-3 text-center">
        <p className="text-lg font-bold tracking-tight text-slate-900">Saintly</p>
        <p className="text-[13px] font-medium tracking-wide text-slate-600">Home Health</p>
      </div>
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

  return (
    <div className="flex w-full flex-1 flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto flex w-full max-w-[min(100%,20rem)] flex-1 flex-col">
        {/* Upper–middle stack: tighter top, no giant vertical center gap */}
        <div className="flex flex-col items-center pt-6 sm:pt-8">
          <BrandMark />

          <div className="mt-6 w-full rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_20px_50px_-18px_rgba(30,58,138,0.22),0_0_0_1px_rgba(255,255,255,0.8)_inset] sm:p-7">
            <h1 className="text-center text-[1.375rem] font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">
              Welcome to Saintly
            </h1>
            <p className="mt-1.5 text-center text-[13px] leading-relaxed text-slate-500">
              Sign in to access your dashboard
            </p>

            {urlError === "auth" ? (
              <p className="mt-5 rounded-xl border border-red-200/90 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                Could not complete sign-in. Try again or contact an administrator.
              </p>
            ) : null}

            <form
              className={`flex flex-col ${urlError === "auth" ? "mt-5" : "mt-6"}`}
              onSubmit={handleSubmit}
            >
              <div className="flex flex-col gap-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-slate-400"
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
                    className="mt-1.5 w-full rounded-xl border border-slate-200/95 bg-white px-4 py-3 text-[15px] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-slate-400"
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
                    className="mt-1.5 w-full rounded-xl border border-slate-200/95 bg-white px-4 py-3 text-[15px] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
                  />
                </div>
              </div>

              {error ? (
                <p className="mt-4 rounded-xl border border-red-200/90 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="mt-7 flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-sky-500 to-blue-800 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-6px_rgba(30,64,175,0.45)] transition hover:brightness-[1.03] active:brightness-[0.97] disabled:opacity-55"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>

        <div className="min-h-4 flex-1" aria-hidden />
      </div>
    </div>
  );
}
