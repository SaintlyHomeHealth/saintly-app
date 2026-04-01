import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in | Saintly Admin",
  description: "Staff sign in for Saintly Home Health admin",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Suspense
        fallback={
          <div className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500">
            Loading…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
