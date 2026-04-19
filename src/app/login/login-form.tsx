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
    <div className="relative z-10 flex h-[5.15rem] w-[5.15rem] shrink-0 items-center justify-center rounded-[1.85rem] border border-white/80 bg-white/68 shadow-[0_18px_40px_-26px_rgba(30,64,175,0.5),0_10px_22px_-18px_rgba(15,23,42,0.32)] ring-1 ring-sky-100/75 backdrop-blur-xl">
      <div
        className="absolute inset-[0.28rem] rounded-[1.55rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(239,246,255,0.8))]"
        aria-hidden
      />
      <Image
        src="/brand/saintly-app-icon-master.png"
        alt="Saintly Home Health"
        width={1024}
        height={1024}
        priority
        draggable={false}
        className="relative h-[2.85rem] w-[2.85rem] select-none object-contain opacity-[0.96] [image-rendering:-webkit-optimize-contrast]"
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
    "mt-1.5 w-full rounded-2xl border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-3.5 py-[0.78rem] text-[15px] leading-snug text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_1px_2px_rgba(15,23,42,0.03)] outline-none transition placeholder:text-slate-400/90 focus:border-sky-500/50 focus:bg-white focus:shadow-[inset_0_1px_1px_rgba(255,255,255,0.92),0_0_0_3px_rgba(56,189,248,0.11),0_10px_18px_-16px_rgba(14,165,233,0.4)]";

  return (
    <div className="flex min-h-dvh w-full flex-col justify-start px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.45rem,env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto flex w-full max-w-[min(100%,18.15rem)] flex-1 flex-col items-center pt-3 sm:pt-4">
        <div className="relative w-full">
          <div className="mx-auto w-fit">
            <SaintlyLogoMark />
          </div>

          <div className="-mt-3.5 w-full rounded-[1.9rem] border border-white/72 bg-white/92 px-4 pb-4 pt-7 shadow-[0_24px_50px_-34px_rgba(29,78,216,0.4),0_16px_28px_-24px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/55 backdrop-blur-sm sm:px-[1.125rem]">
            <h1 className="text-center text-[1.375rem] font-bold leading-[1.05] tracking-[-0.032em] text-slate-900">
              Welcome to Saintly
            </h1>
            <p className="mt-1 text-center text-[11px] leading-snug text-slate-500">
              Sign in to access your dashboard
            </p>

            {urlError === "auth" ? (
              <p className="mt-3 rounded-2xl border border-red-200/90 bg-red-50/95 px-3 py-2 text-sm text-red-800">
                Could not complete sign-in. Try again or contact an administrator.
              </p>
            ) : null}

            <form
              className={`flex flex-col ${urlError === "auth" ? "mt-3" : "mt-4"}`}
              onSubmit={handleSubmit}
            >
              <div className="flex flex-col gap-2.75">
                <div>
                  <label
                    htmlFor="email"
                    className="block pl-0.5 text-[0.62rem] font-medium uppercase tracking-[0.08em] text-slate-500/95"
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
                    className="block pl-0.5 text-[0.62rem] font-medium uppercase tracking-[0.08em] text-slate-500/95"
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
                <p className="mt-2.5 rounded-2xl border border-red-200/90 bg-red-50/95 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="mt-3.5 flex w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#58b3ff] via-[#2d8cf1] to-[#1f5ecf] py-[0.84rem] text-[15px] font-semibold tracking-[0.01em] text-white shadow-[0_14px_22px_-18px_rgba(29,78,216,0.42),0_4px_10px_-8px_rgba(15,23,42,0.16)] transition hover:brightness-[1.02] active:brightness-[0.985] disabled:opacity-55"
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
