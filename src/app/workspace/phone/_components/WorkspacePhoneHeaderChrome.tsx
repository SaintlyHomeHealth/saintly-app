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
      className={`sticky top-0 z-30 border-b border-sky-100/70 bg-white/95 px-3 pb-1.5 pt-[calc(0.45rem+env(safe-area-inset-top,0px))] backdrop-blur-md supports-[backdrop-filter]:bg-white/90 sm:px-4 sm:pb-2 sm:pt-[calc(0.65rem+env(safe-area-inset-top,0px))] sm:shadow-[0_4px_24px_-12px_rgba(30,58,138,0.08)] lg:pb-2 lg:pt-[calc(0.5rem+env(safe-area-inset-top,0px))] ${
        inboxListDesktop
          ? "lg:border-slate-200/80 lg:px-3 lg:pb-1 lg:pt-1 lg:shadow-none"
          : ""
      }`}
    >
      {children}
    </header>
  );
}
