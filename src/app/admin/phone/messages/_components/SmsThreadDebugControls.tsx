"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { markLatestInboundUnreadForDebug, markSmsThreadInboundViewed } from "../actions";

export function SmsThreadDebugControls({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onMarkRead = () => {
    startTransition(async () => {
      await markSmsThreadInboundViewed(conversationId);
      router.refresh();
    });
  };

  const onMarkUnread = () => {
    startTransition(async () => {
      await markLatestInboundUnreadForDebug(conversationId);
      router.refresh();
    });
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onMarkRead}
        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100/80 disabled:opacity-50"
      >
        Mark read
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onMarkUnread}
        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-950 hover:bg-amber-100/80 disabled:opacity-50"
      >
        Mark unread (latest inbound)
      </button>
    </div>
  );
}
