"use client";

import { useEffect, useRef } from "react";

import { markSmsThreadInboundViewed } from "../actions";

export function SmsThreadMarkViewedClient({ conversationId }: { conversationId: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void markSmsThreadInboundViewed(conversationId);
  }, [conversationId]);
  return null;
}
