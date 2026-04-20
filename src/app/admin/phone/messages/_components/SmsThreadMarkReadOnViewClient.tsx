"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

import { markSmsThreadInboundViewed } from "../actions";

/**
 * Marks inbound messages read when this thread is the active (selected) conversation.
 * Deferred two animation frames so the thread shell + messages can paint before server work.
 */
export function SmsThreadMarkReadOnViewClient({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        void (async () => {
          await markSmsThreadInboundViewed(conversationId);
          if (cancelled) return;
          startTransition(() => {
            router.refresh();
          });
        })();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [conversationId, router]);

  return null;
}
