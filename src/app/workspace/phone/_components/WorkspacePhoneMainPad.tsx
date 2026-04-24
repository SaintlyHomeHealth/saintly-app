import { Suspense, type ReactNode } from "react";

import { WorkspacePhoneMainPadClient } from "./WorkspacePhoneMainPadClient";

function MainFallback({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto pb-[var(--ws-phone-nav-pad)]">
      {children}
    </main>
  );
}

/**
 * Bottom padding for `/workspace/phone/*` main: when in a call the bottom nav is hidden so we only
 * reserve space for the floating ActiveCallBar + safe area (not nav + bar).
 */
export function WorkspacePhoneMainPad({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<MainFallback>{children}</MainFallback>}>
      <WorkspacePhoneMainPadClient>{children}</WorkspacePhoneMainPadClient>
    </Suspense>
  );
}
