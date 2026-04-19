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
    <div className="shrink-0">
      <Image
        src="/saintly-home-health-app-icon.png"
        alt="Saintly Home Health"
        width={88}
        height={88}
        priority
        draggable={false}
        className="h-[88px] w-[88px] select-none object-contain [image-rendering:-webkit-optimize-contrast] drop-shadow-[0_6px_14px_rgba(37,99,235,0.08)]"
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
    "h-[52px] w-full rounded-2xl border border-[#d9e6f2] bg-white px-4 text-[15px] leading-snug text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400/70 focus:ring-4 focus:ring-sky-100";

  return (
    <div className="flex min-h-dvh w-full flex-col px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-[max(20px,calc(env(safe-area-inset-top)+20px))] sm:px-6">
      <div className="mx-auto flex w-full max-w-[320px] flex-col items-center">
        <div className="mb-3 mt-5">
          <SaintlyLogoMark />
        </div>

        <div className="w-full rounded-[28px] border border-[#e2ebf3] bg-white p-6 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
          <h1 className="mb-1.5 text-center text-[24px] font-bold leading-tight tracking-[-0.02em] text-[#14233d]">
            Welcome to Saintly
          </h1>
          <p className="mb-5 text-center text-[14px] leading-[1.45] text-[#6f8095]">
            Sign in to access your dashboard
          </p>

          {urlError === "auth" ? (
            <p className="mb-5 rounded-2xl border border-red-200/90 bg-red-50/95 px-3 py-2 text-sm text-red-800">
              Could not complete sign-in. Try again or contact an administrator.
            </p>
          ) : null}

          <form className="flex flex-col" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#718296]"
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
                className={`${inputClass} mb-3.5`}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#718296]"
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

            {error ? (
              <p className="mt-3.5 rounded-2xl border border-red-200/90 bg-red-50/95 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className={`h-[54px] w-full rounded-[18px] bg-gradient-to-b from-[#49adff] to-[#2567dc] text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(37,103,220,0.18)] transition hover:brightness-[1.02] active:brightness-[0.98] disabled:opacity-55 ${
                error ? "mt-3.5" : "mt-[18px]"
              }`}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>

      <div className="flex-1" />
    </div>
  );
}
