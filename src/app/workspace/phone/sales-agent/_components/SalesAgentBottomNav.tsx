"use client";

import { ClipboardList, MessageCircle, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import {
  SALES_AGENT_CHAT,
  SALES_AGENT_ORDERS_BASE,
  SALES_AGENT_ORDERS_NEW,
} from "@/lib/sales-agent/sales-agent-workspace-paths";

type Tab = {
  href: string;
  label: string;
  match: RegExp;
  icon: React.ReactNode;
};

const iconWrap = "flex h-8 w-8 items-center justify-center rounded-xl border border-transparent";

const tabs: Tab[] = [
  {
    href: SALES_AGENT_ORDERS_BASE,
    label: "Orders",
    match: /^\/workspace\/phone\/sales-agent\/leads(?:\/(?!new)[^/]+)?$/,
    icon: (
      <span className={iconWrap}>
        <ClipboardList className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
  },
  {
    href: SALES_AGENT_ORDERS_NEW,
    label: "Create",
    match: /^\/workspace\/phone\/sales-agent\/leads\/new$/,
    icon: (
      <span className={iconWrap}>
        <UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
  },
  {
    href: SALES_AGENT_CHAT,
    label: "Chat",
    match: /^\/workspace\/phone\/sales-agent\/chat$/,
    icon: (
      <span className={iconWrap}>
        <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
  },
];

type Props = {
  allowedTabHrefs?: string[] | null;
  initialChatUnread?: boolean;
};

function SalesAgentBottomNavInner({ allowedTabHrefs = null, initialChatUnread = false }: Props) {
  const pathname = usePathname() ?? "";
  const [chatUnread, setChatUnread] = useState(initialChatUnread);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/sales-agent/chat/unread", { cache: "no-store" });
        const json = (await res.json()) as { hasUnread?: boolean };
        if (!cancelled) setChatUnread(Boolean(json.hasUnread));
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pathname]);

  const visibleTabs = useMemo(() => {
    if (!allowedTabHrefs?.length) return tabs;
    const allow = new Set(allowedTabHrefs);
    return tabs.filter((t) => allow.has(t.href));
  }, [allowedTabHrefs]);

  const isActive = useCallback(
    (match: RegExp) => match.test(pathname),
    [pathname]
  );

  if (visibleTabs.length === 0) return null;

  return (
    <nav
      className="pointer-events-auto fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_24px_-8px_rgba(30,58,138,0.07)] backdrop-blur supports-[backdrop-filter]:bg-white/85"
      aria-label="Sales Agent"
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch justify-between gap-1 px-2 pt-1">
        {visibleTabs.map((t) => {
          const active = isActive(t.match);
          const unread = t.href === SALES_AGENT_CHAT && chatUnread && !active;
          return (
            <li key={t.href} className="min-w-0 flex-1">
              <Link
                href={t.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col items-center justify-center rounded-xl px-0.5 py-2 text-[10px] font-semibold leading-tight no-underline sm:text-[11px] ${
                  active
                    ? "bg-sky-50 text-sky-900 ring-1 ring-inset ring-sky-200"
                    : unread
                      ? "bg-amber-50/90 text-amber-950 ring-1 ring-inset ring-amber-200/90"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <span
                  className={`mb-0.5 flex flex-col items-center [&_svg]:pointer-events-none ${
                    active ? "text-sky-700" : unread ? "text-amber-700" : "text-slate-400"
                  }`}
                >
                  {t.icon}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const SalesAgentBottomNav = memo(SalesAgentBottomNavInner);
