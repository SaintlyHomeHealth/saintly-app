import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in | Saintly Admin",
  description: "Staff sign in for Saintly Home Health admin",
};

export default function LoginPage() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#dcecf9] via-[#eef6fc] to-[#fcfdfd]">
      <div className="flex min-h-dvh flex-col">
        <Suspense
          fallback={
            <div className="flex min-h-dvh flex-col justify-start px-5 pt-[max(20px,calc(env(safe-area-inset-top)+20px))] text-sm text-slate-500 sm:px-6">
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
