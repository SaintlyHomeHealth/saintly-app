import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/post-login-redirect";
import { getStaffProfile } from "@/lib/staff-profile";

import { ForcedPasswordForm } from "./forced-password-form";

export default async function ForcedPasswordChangePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff) {
    redirect("/login");
  }
  if (!staff.require_password_change) {
    redirect(DEFAULT_POST_LOGIN_PATH);
  }

  const sp = (await searchParams) ?? {};
  const nextRaw = sp.next;
  const nextParam = typeof nextRaw === "string" ? nextRaw : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center px-5 py-10">
      <h1 className="text-xl font-bold text-slate-900">Choose a new password</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        An administrator reset your access or created your login with a temporary password. Set a new password you have
        not used elsewhere to continue.
      </p>
      <Suspense fallback={<p className="mt-4 text-sm text-slate-500">Loading…</p>}>
        <ForcedPasswordForm />
      </Suspense>
      {nextParam ? (
        <p className="mt-4 text-center text-xs text-slate-500">
          After saving you&apos;ll return to{" "}
          <span className="font-mono [overflow-wrap:anywhere]">{nextParam}</span>
        </p>
      ) : null}
      <p className="mt-6 text-center text-xs text-slate-500">
        Wrong account?{" "}
        <Link href="/login" className="font-semibold text-sky-700 underline">
          Sign out and switch
        </Link>
      </p>
    </div>
  );
}
