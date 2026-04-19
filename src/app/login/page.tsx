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
      {/* Soft radial halo behind brand — calm medical blue, no harsh edges */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[min(44vh,320px)] w-[min(118vw,480px)] -translate-x-1/2 -translate-y-[18%] rounded-full bg-[radial-gradient(ellipse_80%_70%_at_50%_38%,rgba(147,197,253,0.4)_0%,rgba(219,234,254,0.18)_45%,transparent_72%)]"
        aria-hidden
      />
      <div className="relative flex min-h-dvh flex-col bg-gradient-to-b from-[#c7e0f5] via-[#eef6fc] to-[#fffdfb]">
        <Suspense
          fallback={
            <div className="flex min-h-dvh flex-col justify-start px-5 pt-[max(0.75rem,env(safe-area-inset-top))] text-sm text-slate-500 sm:px-6">
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
