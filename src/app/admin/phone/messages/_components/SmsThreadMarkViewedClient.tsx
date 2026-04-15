"use client";

import { useEffect, useRef } from "react";

import { markSmsThreadInboundViewed } from "../actions";

/**
 * After the user last interacted with the thread pane (pointer, focus, or wheel),
 * wait this long with the tab visible before marking inbound messages read.
 * Keeps unread until intentional engagement, not first paint / auto-select.
 */
const MARK_VIEWED_DELAY_MS = 1200;

function getThreadPane(conversationId: string): Element | null {
  return document.querySelector(`[data-sms-thread-pane="${conversationId}"]`);
}

function eventTargetInPane(pane: Element, e: Event): boolean {
  const t = e.target;
  if (!(t instanceof Node)) return false;
  return pane.contains(t);
}

export function SmsThreadMarkViewedClient({ conversationId }: { conversationId: string }) {
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    firedRef.current = false;
    if (typeof document === "undefined") return;

    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleMarkRead = () => {
      if (firedRef.current) return;
      if (document.visibilityState !== "visible") return;
      if (!getThreadPane(conversationId)) return;

      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (firedRef.current) return;
        if (document.visibilityState !== "visible") return;
        if (!getThreadPane(conversationId)) return;
        firedRef.current = true;
        void markSmsThreadInboundViewed(conversationId);
      }, MARK_VIEWED_DELAY_MS);
    };

    const maybeArmFromEvent = (e: Event) => {
      if (firedRef.current) return;
      if (document.visibilityState !== "visible") return;
      const pane = getThreadPane(conversationId);
      if (!pane || !eventTargetInPane(pane, e)) return;
      scheduleMarkRead();
    };

    const onPointerDown = (e: PointerEvent) => {
      maybeArmFromEvent(e);
    };

    const onFocusIn = (e: FocusEvent) => {
      maybeArmFromEvent(e);
    };

    const onWheel = (e: WheelEvent) => {
      maybeArmFromEvent(e);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearTimer();
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("wheel", onWheel, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimer();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("wheel", onWheel, { capture: true });
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [conversationId]);

  return null;
}
