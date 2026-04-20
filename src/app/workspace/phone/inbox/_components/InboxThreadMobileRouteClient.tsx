"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `/workspace/phone/inbox?thread=` drives the desktop split view, but the conversation pane is `lg+` only.
 * On small screens, normalize to `/workspace/phone/inbox/[conversationId]` so the thread is full-screen.
 */
export function InboxThreadMobileRouteClient() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;

    const sp = new URLSearchParams(window.location.search);
    const thread = sp.get("thread")?.trim() ?? "";
    if (!thread || !UUID_RE.test(thread)) return;

    ran.current = true;
    sp.delete("thread");
    const rest = sp.toString();
    router.replace(`/workspace/phone/inbox/${thread}${rest ? `?${rest}` : ""}`);
  }, [router]);

  return null;
}
