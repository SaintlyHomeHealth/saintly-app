import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in | Saintly Admin",
  description: "Staff sign in for Saintly Home Health admin",
};

export default function LoginPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Soft medical-blue atmosphere kept close to the top so the login stack feels native and composed. */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[min(34vh,240px)] w-[min(112vw,440px)] -translate-x-1/2 -translate-y-[14%] rounded-full bg-[radial-gradient(ellipse_78%_72%_at_50%_34%,rgba(125,178,238,0.42)_0%,rgba(207,228,248,0.28)_44%,transparent_74%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-[18%] h-36 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.42),transparent_72%)]"
        aria-hidden
      />
      <div className="relative flex min-h-dvh flex-col bg-gradient-to-b from-[#d0e4f6] via-[#edf5fb] to-[#fcfeff]">
        <Suspense
          fallback={
            <div className="flex min-h-dvh flex-col justify-start px-5 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm text-slate-500 sm:px-6">
              Loading…
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
