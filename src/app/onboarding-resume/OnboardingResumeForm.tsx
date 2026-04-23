"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { RequestOnboardingResumeLinkResult } from "@/lib/onboarding/resume-link-request";

import { requestOnboardingResumeLinkAction } from "./actions";

export default function OnboardingResumeForm() {
  const [state, formAction, isPending] = useActionState<
    RequestOnboardingResumeLinkResult | null,
    FormData
  >(requestOnboardingResumeLinkAction, null);

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Resume onboarding</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter the email you used with Saintly Home Health. If we find your onboarding profile,
        we&apos;ll send you a secure link to continue. Your progress is saved automatically—you can
        switch devices or clear your browser and pick up where you left off.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="resume-email" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Email
          </label>
          <input
            id="resume-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isPending}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50"
            placeholder="you@example.com"
          />
        </div>

        {state?.ok === false ? (
          <p className="text-sm text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.ok === true ? (
          <p className="text-sm text-emerald-800" role="status">
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="shh-btn shh-btn--primary w-full disabled:opacity-60"
        >
          {isPending ? "Sending…" : "Email me my link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        <Link href="/onboarding-welcome" className="text-sky-700 underline">
          I already have my link
        </Link>
        {" · "}
        <Link href="/" className="text-sky-700 underline">
          Home
        </Link>
      </p>
    </div>
  );
}
