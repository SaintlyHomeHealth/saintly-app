import Link from "next/link";
import type { ReactNode } from "react";

/**
 * `/workspace/pay` sits outside the phone sub-layout; keep a light shell and a path back to the phone workspace.
 */
export default function WorkspacePayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50/90 via-white to-sky-50/40 pb-10 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-sky-100/80 bg-white/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-800/80">Saintly</p>
            <p className="truncate text-sm font-semibold text-slate-900">Pay &amp; visits</p>
          </div>
          <Link
            href="/workspace/phone/visits"
            className="shrink-0 rounded-full border border-sky-200/90 bg-white px-3 py-2 text-xs font-semibold text-sky-900 shadow-sm transition hover:bg-sky-50"
          >
            Back to phone
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl px-4 pt-6">{children}</div>
    </div>
  );
}
