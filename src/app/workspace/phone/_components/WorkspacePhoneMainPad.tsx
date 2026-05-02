import { Suspense, type ReactNode } from "react";

import { WorkspacePhoneMainPadClient } from "./WorkspacePhoneMainPadClient";

function MainFallback() {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto pb-[var(--ws-phone-nav-pad)]">
      <div
        className="flex min-h-[35vh] flex-col gap-3 px-4 pb-8 pt-5 sm:px-5"
        aria-busy="true"
        aria-label="Loading"
      >
        <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-slate-100" />
        <div className="mt-4 space-y-2">
          <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100/90" />
          <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100/90" />
          <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100/90" />
        </div>
      </div>
    </main>
  );
}

/**
 * Bottom padding for `/workspace/phone/*` main: when in a call the bottom nav is hidden so we only
 * reserve space for the floating ActiveCallBar + safe area (not nav + bar).
 */
export function WorkspacePhoneMainPad({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<MainFallback />}>
      <WorkspacePhoneMainPadClient>{children}</WorkspacePhoneMainPadClient>
    </Suspense>
  );
}
