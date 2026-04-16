"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markSmsThreadInboundViewed } from "../actions";

/**
 * Marks inbound messages read when this thread is the active (selected) conversation.
 * Runs once per conversationId change on the client — no timers, focus, scroll, or hover.
 */
export function SmsThreadMarkReadOnViewClient({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      await markSmsThreadInboundViewed(conversationId);
      router.refresh();
    })();
  }, [conversationId, router]);

  return null;
}
