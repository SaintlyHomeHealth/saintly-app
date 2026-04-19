"use client";

import Image from "next/image";
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

/** Official Saintly Home Health app icon — full-bleed asset, scaled for login; no substitute graphics. */
function SaintlyLogoMark() {
  return (
    <div className="relative shrink-0">
      <Image
        src="/brand/saintly-home-health-app-icon.png"
        alt="Saintly Home Health"
        width={1024}
        height={1024}
        priority
        draggable={false}
        className="h-[8rem] w-[8rem] select-none object-contain [image-rendering:-webkit-optimize-contrast] drop-shadow-[0_1px_2px_rgba(255,255,255,0.45),0_4px_14px_rgba(15,23,42,0.08)]"
      />
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
    "mt-1 w-full rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-[15px] leading-snug text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400/90 focus:border-sky-500/55 focus:shadow-[inset_0_1px_2px_rgba(15,23,42,0.05),0_0_0_3px_rgba(14,165,233,0.12)]";

  return (
    <div className="flex min-h-dvh w-full flex-col justify-start px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto w-full max-w-[min(100%,19.5rem)] shrink-0">
        <div className="flex flex-col items-center pt-1 sm:pt-2">
          <SaintlyLogoMark />

          <div className="mt-2.5 w-full rounded-3xl border border-slate-200/65 bg-white p-4 shadow-[0_12px_32px_-18px_rgba(30,58,138,0.22),0_0_0_1px_rgba(255,255,255,0.85)_inset] sm:p-[1.125rem]">
            <h1 className="text-center text-xl font-bold leading-tight tracking-[-0.025em] text-slate-900">
              Welcome to Saintly
            </h1>
            <p className="mt-0.5 text-center text-[11px] leading-snug text-slate-400">
              Sign in to access your dashboard
            </p>

            {urlError === "auth" ? (
              <p className="mt-3 rounded-xl border border-red-200/90 bg-red-50 px-3 py-2 text-sm text-red-800">
                Could not complete sign-in. Try again or contact an administrator.
              </p>
            ) : null}

            <form
              className={`flex flex-col ${urlError === "auth" ? "mt-3" : "mt-4"}`}
              onSubmit={handleSubmit}
            >
              <div className="flex flex-col gap-2.5">
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
                <p className="mt-2.5 rounded-xl border border-red-200/90 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="mt-4 flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-sky-500 to-blue-800 py-2.5 text-[15px] font-semibold tracking-wide text-white shadow-[0_2px_10px_-3px_rgba(37,99,235,0.32),0_1px_2px_rgba(15,23,42,0.05)] transition hover:brightness-[1.025] active:brightness-[0.98] disabled:opacity-55"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
