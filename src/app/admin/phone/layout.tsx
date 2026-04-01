import type { ReactNode } from "react";

import { SignOutButton } from "@/components/SignOutButton";

/**
 * Shared strip for all phone command-center routes so logout is always reachable
 * (main triage, messages, tasks, call detail, etc.).
 */
export default function AdminPhoneLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="sticky top-0 z-40 flex items-center justify-end gap-2 border-b border-slate-200/90 bg-white/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <SignOutButton
          label="Log out"
          className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
        />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
