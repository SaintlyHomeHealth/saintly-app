"use client";

import dynamic from "next/dynamic";

/** Client-only lazy boundaries (`ssr: false` cannot be used from Server Components). */
export const WorkspaceSmsThreadViewLazy = dynamic(
  () =>
    import("@/app/workspace/phone/inbox/_components/WorkspaceSmsThreadView").then((m) => m.WorkspaceSmsThreadView),
  {
    ssr: false,
    loading: () => (
      <div
        className="mx-auto min-h-[12rem] w-full max-w-[40rem] animate-pulse rounded-xl border border-slate-200/80 bg-slate-100/60"
        aria-hidden
      />
    ),
  }
);
