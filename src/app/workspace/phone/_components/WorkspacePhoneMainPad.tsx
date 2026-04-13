"use client";

import type { ReactNode } from "react";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

/**
 * Bottom padding for `/workspace/phone/*` main: when in a call the bottom nav is hidden so we only
 * reserve space for the floating ActiveCallBar + safe area (not nav + bar).
 */
export function WorkspacePhoneMainPad({ children }: { children: ReactNode }) {
  const { status } = useWorkspaceSoftphone();
  const pb =
    status === "in_call"
      ? "pb-[max(6.5rem,env(safe-area-inset-bottom,0px))]"
      : "pb-32";
  return <main className={`mx-auto flex w-full max-w-6xl flex-1 flex-col ${pb}`}>{children}</main>;
}
