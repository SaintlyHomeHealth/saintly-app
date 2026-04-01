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
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Staff sign in
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to access the Saintly admin dashboard.
        </p>

        {urlError === "auth" ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Could not complete sign-in. Try again or contact an administrator.
          </p>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500 focus:border-sky-300 focus:ring-2"
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
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-sky-500 focus:border-sky-300 focus:ring-2"
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
