"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

const WORKSPACE_INBOX_CONVERSATION_PATH =
  /^\/workspace\/phone\/inbox\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_IN_QUERY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Props = { children: ReactNode };

/**
 * Client half of WorkspacePhoneMainPad: overflow must be hidden for bounded SMS layouts
 * (dedicated thread route or inbox ?thread= split pane).
 */
export function WorkspacePhoneMainPadClient({ children }: Props) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const threadQ = searchParams?.get("thread")?.trim() ?? "";
  const isInboxSplitThread =
    pathname === "/workspace/phone/inbox" && threadQ.length > 0 && UUID_IN_QUERY.test(threadQ);

  const isSmsConversationThread =
    WORKSPACE_INBOX_CONVERSATION_PATH.test(pathname) || isInboxSplitThread;

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
