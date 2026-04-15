"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

/**
 * `/workspace/phone/inbox/<conversationUuid>` — SMS thread uses a bounded flex column; only the
 * message list scrolls inside WorkspaceSmsThreadView. Parent `<main>` must not be the scroll root.
 */
const WORKSPACE_INBOX_CONVERSATION_PATH =
  /^\/workspace\/phone\/inbox\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Bottom padding for `/workspace/phone/*` main: when in a call the bottom nav is hidden so we only
 * reserve space for the floating ActiveCallBar + safe area (not nav + bar).
 */
export function WorkspacePhoneMainPad({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isSmsConversationThread = WORKSPACE_INBOX_CONVERSATION_PATH.test(pathname);
  const { status } = useWorkspaceSoftphone();
  const pb =
    status === "in_call"
      ? "pb-[max(6.5rem,env(safe-area-inset-bottom,0px))]"
      : "pb-32";
  const overflowClass = isSmsConversationThread ? "overflow-hidden" : "overflow-y-auto";
  return (
    <main className={`mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col ${overflowClass} ${pb}`}>
      {children}
    </main>
  );
}
