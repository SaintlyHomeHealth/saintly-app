"use client";

import { useEffect, useRef, type ReactNode } from "react";

const KEY = "workspace-inbox-list-scroll-y";

type Props = {
  children: ReactNode;
};

/**
 * Restores vertical scroll on the inbox list when navigating back from a thread (sessionStorage).
 */
export function InboxScrollRestorer({ children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const raw = sessionStorage.getItem(KEY);
    if (raw == null) return;
    const y = Number(raw);
    if (!Number.isFinite(y) || y < 0) return;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      sessionStorage.setItem(KEY, String(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
