"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useWorkspacePhoneInCallLayout } from "@/components/softphone/WorkspaceSoftphoneContext";
import { routePerfEnabled } from "@/lib/perf/route-perf";

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
  const isKeypadRoute = pathname === "/workspace/phone/keypad";
  const searchParams = useSearchParams();
  const threadQ = searchParams?.get("thread")?.trim() ?? "";
  const isInboxSplitThread =
    pathname === "/workspace/phone/inbox" && threadQ.length > 0 && UUID_IN_QUERY.test(threadQ);

  const isSmsConversationThread =
    WORKSPACE_INBOX_CONVERSATION_PATH.test(pathname) || isInboxSplitThread;

  const isInboxRoute = pathname === "/workspace/phone/inbox";
  /** Inbox list: keep scroll inside the list column only — outer <main> must not scroll (avoids grey dead space). */
  const isInboxListOnly = isInboxRoute;
  /** Internal chat list + thread: same bounded flex column as SMS (single bottom inset via --ws-phone-nav-pad). */
  const isWorkspaceChatRoute = /^\/workspace\/phone\/chat(\/|$)/.test(pathname);
  const mainWidthClass = isInboxRoute ? "max-w-none w-full" : "max-w-6xl";

  const inCallLayout = useWorkspacePhoneInCallLayout();
  const pb =
    inCallLayout
      ? "pb-[max(6.5rem,env(safe-area-inset-bottom,0px))]"
      : isKeypadRoute
        ? // Keypad: reserve space for fixed bottom nav + safe area (inbox-style) so the Call row never sits under nav
          "pb-[max(8rem,calc(5.75rem+env(safe-area-inset-bottom,0px)))]"
        : // One shared inset for fixed bottom nav (avoid stacking pb-32 + inner pb-* dead space on mobile)
          "pb-[var(--ws-phone-nav-pad)]";
  const overflowClass =
    isSmsConversationThread || isInboxListOnly || isWorkspaceChatRoute ? "overflow-hidden" : "overflow-y-auto";

  useEffect(() => {
    if (!routePerfEnabled()) return;
    const label = `APP_RENDER:${pathname}`;
    console.time(label);
    const id = requestAnimationFrame(() => {
      console.timeEnd(label);
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <main
      className={`mx-auto flex min-h-0 w-full flex-1 flex-col ${mainWidthClass} ${overflowClass} ${pb}`}
    >
      {children}
    </main>
  );
}
