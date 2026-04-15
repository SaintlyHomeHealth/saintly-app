"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Props = { children: ReactNode };

/**
 * Desktop inbox list (`/workspace/phone/inbox` only): compress top app header — other routes unchanged.
 */
export function WorkspacePhoneHeaderChrome({ children }: Props) {
  const pathname = usePathname() ?? "";
  const inboxListDesktop = pathname === "/workspace/phone/inbox";

  return (
    <header
      className={`sticky top-0 z-30 border-b border-sky-100/70 bg-white/95 px-4 pb-2 pt-[calc(0.65rem+env(safe-area-inset-top,0px))] shadow-[0_4px_24px_-12px_rgba(30,58,138,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90 lg:pb-2 lg:pt-[calc(0.5rem+env(safe-area-inset-top,0px))] ${
        inboxListDesktop
          ? "lg:border-slate-200/80 lg:px-3 lg:pb-1 lg:pt-1 lg:shadow-none"
          : ""
      }`}
    >
      {children}
    </header>
  );
}
