"use client";

import dynamic from "next/dynamic";
import type { SoftphoneDialerProps } from "@/components/softphone/SoftphoneDialer";

const SoftphoneDialer = dynamic(
  () => import("@/components/softphone/SoftphoneDialer").then((m) => ({ default: m.SoftphoneDialer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50/80 text-sm text-slate-500">
        Loading dialer…
      </div>
    ),
  }
);

export function KeypadDialerLazy(props: SoftphoneDialerProps) {
  return <SoftphoneDialer {...props} />;
}
