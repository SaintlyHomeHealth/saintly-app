"use client";

import { useEffect } from "react";

import { markSmsThreadInboundViewed } from "../actions";

/**
 * Marks inbound messages read when this thread is the active (selected) conversation.
 * Deferred two animation frames so the thread shell + messages can paint before server work.
 */
export function SmsThreadMarkReadOnViewClient({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        void (async () => {
          await markSmsThreadInboundViewed(conversationId);
        })();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [conversationId]);

  return null;
}
