import type { ReactNode } from "react";

import { SalesAgentBottomNav } from "./SalesAgentBottomNav";

type Props = {
  displayName: string;
  children: ReactNode;
  allowedTabHrefs?: string[] | null;
};

export function SalesAgentAppShell({ displayName, children, allowedTabHrefs = null }: Props) {
  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">Saintly Sales</p>
            <p className="truncate text-sm font-semibold text-slate-900">Sales Agent Portal</p>
          </div>
          <p className="truncate text-xs text-slate-500">{displayName}</p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-24">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>

      <SalesAgentBottomNav allowedTabHrefs={allowedTabHrefs} />
    </div>
  );
}
