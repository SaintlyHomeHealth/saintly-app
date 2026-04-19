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

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

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
    <div className="flex w-full flex-1 flex-col items-center justify-center px-6 py-12 sm:py-16">
      <div className="flex w-full max-w-md flex-col items-center">
        <div className="mb-7 flex w-full flex-col items-center">
          {!logoFailed ? (
            <Image
              src="/saintly-logo.png"
              alt="Saintly Home Health"
              width={338}
              height={104}
              className="h-20 w-auto max-w-[min(100%,340px)] object-contain opacity-[0.97] drop-shadow-[0_2px_14px_rgba(15,23,42,0.08)]"
              priority
              sizes="340px"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <p className="text-center text-3xl font-semibold tracking-tight text-sky-950 drop-shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
              Saintly Home Health
            </p>
          )}
        </div>

        <div className="w-full rounded-3xl border border-gray-100 bg-white/98 p-9 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12)] backdrop-blur-[2px]">
          <h1 className="text-center text-2xl font-bold tracking-tighter text-slate-900">
            Welcome to Saintly
          </h1>
          <p className="mt-2 text-center text-xs text-gray-500">
            Sign in to access your dashboard
          </p>

          {urlError === "auth" ? (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              Could not complete sign-in. Try again or contact an administrator.
            </p>
          ) : null}

          <form
            className={`flex flex-col ${urlError === "auth" ? "mt-6" : "mt-8"}`}
            onSubmit={handleSubmit}
          >
            <div className="flex flex-col gap-5">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
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
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
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
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
                />
              </div>
            </div>

            {error ? (
              <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-8 w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 py-4 text-sm font-semibold text-white shadow-md shadow-blue-900/20 transition hover:opacity-95 active:opacity-90 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
