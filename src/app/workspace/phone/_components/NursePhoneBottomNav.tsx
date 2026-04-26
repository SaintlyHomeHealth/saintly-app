"use client";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";
import { routePerfLog, routePerfStart } from "@/lib/perf/route-perf";
import {
  CalendarDays,
  Hash,
  Inbox,
  MessageCircle,
  Phone,
  UserPlus,
  Users,
  Voicemail,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Tab = {
  href: string;
  label: ReactNode;
  match: RegExp;
  icon: ReactNode;
  iconTitle: string;
};

const iconWrap = "flex h-8 w-8 items-center justify-center rounded-xl border border-transparent";

const leadsTab: Tab = {
  href: "/workspace/phone/leads",
  label: "Leads",
  match: /^\/workspace\/phone\/leads/,
  icon: (
    <span className={iconWrap}>
      <UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
    </span>
  ),
  iconTitle: "Leads",
};

const tabsBase: Tab[] = [
  {
    href: "/workspace/phone/visits",
    label: "Visits",
    match: /^\/workspace\/phone\/visits$|^\/workspace\/phone$/,
    icon: (
      <span className={iconWrap}>
        <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Visits",
  },
  {
    href: "/workspace/phone/chat",
    label: "Chat",
    match: /^\/workspace\/phone\/chat/,
    icon: (
      <span className={iconWrap}>
        <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Chat",
  },
  {
    href: "/workspace/phone/inbox",
    label: "Inbox",
    match: /^\/workspace\/phone\/inbox/,
    icon: (
      <span className={iconWrap}>
        <Inbox className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Inbox",
  },
  {
    href: "/workspace/phone/calls",
    label: "Calls",
    match: /^\/workspace\/phone\/calls/,
    icon: (
      <span className={iconWrap}>
        <Phone className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Calls",
  },
  {
    href: "/workspace/phone/voicemail",
    label: "Voicemail",
    match: /^\/workspace\/phone\/voicemail/,
    icon: (
      <span className={iconWrap}>
        <Voicemail className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Voicemail",
  },
  {
    href: "/workspace/phone/patients",
    label: "Patients",
    match: /^\/workspace\/phone\/patients/,
    icon: (
      <span className={iconWrap}>
        <Users className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Patients",
  },
  {
    href: "/workspace/phone/keypad",
    label: "Keypad",
    match: /^\/workspace\/phone\/keypad/,
    icon: (
      <span className={iconWrap}>
        <Hash className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Keypad",
  },
  {
    href: "/workspace/pay",
    label: "Pay",
    match: /^\/workspace\/pay/,
    icon: (
      <span className={iconWrap}>
        <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Pay",
  },
];

function isActive(pathname: string, match: RegExp): boolean {
  return match.test(pathname);
}

type NavProps = {
  /** Managers/admins: show Leads. Hidden for nurses / workspace-only staff. */
  showLeadsNav?: boolean;
  /** When set, only these workspace paths appear in the bottom bar (Staff Access page permissions). */
  allowedTabHrefs?: string[] | null;
  /** Server snapshot; client keeps this updated via focused refreshes and a fallback interval. */
  initialInboxHasUnread?: boolean;
};

/** Avoid duplicate unread scans when route/focus/interval triggers happen close together. */
const INBOX_UNREAD_MIN_REFRESH_GAP_MS = 5_000;
const INBOX_UNREAD_FALLBACK_INTERVAL_MS = 90_000;

function NursePhoneBottomNavInner({
  showLeadsNav = true,
  allowedTabHrefs = null,
  initialInboxHasUnread = false,
}: NavProps) {
  const pathname = usePathname() ?? "";
  const { status } = useWorkspaceSoftphone();
  const [inboxHasUnread, setInboxHasUnread] = useState(Boolean(initialInboxHasUnread));
  const unreadRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastUnreadRefreshAtRef = useRef(0);

  const refreshInboxUnread = useCallback(async (options?: { force?: boolean }) => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    const now = Date.now();
    if (
      !options?.force &&
      lastUnreadRefreshAtRef.current > 0 &&
      now - lastUnreadRefreshAtRef.current < INBOX_UNREAD_MIN_REFRESH_GAP_MS
    ) {
      return;
    }
    if (unreadRefreshInFlightRef.current) {
      return unreadRefreshInFlightRef.current;
    }
    lastUnreadRefreshAtRef.current = now;
    const perfStart = routePerfStart();
    const run = (async () => {
      try {
        const res = await fetch("/api/workspace/phone/inbox-unread", { cache: "no-store" });
        const json = (await res.json()) as { hasUnread?: boolean };
        setInboxHasUnread(Boolean(json.hasUnread));
      } catch {
        /* ignore */
      } finally {
        if (perfStart) routePerfLog("workspace_nav:inbox-unread-fetch", perfStart);
        unreadRefreshInFlightRef.current = null;
      }
    })();
    unreadRefreshInFlightRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    setInboxHasUnread(Boolean(initialInboxHasUnread));
  }, [initialInboxHasUnread]);

  useEffect(() => {
    void refreshInboxUnread({ force: true });
  }, [pathname, refreshInboxUnread]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshInboxUnread();
    }, INBOX_UNREAD_FALLBACK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refreshInboxUnread]);

  useEffect(() => {
    const onFocus = () => {
      void refreshInboxUnread({ force: true });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshInboxUnread]);

  /*
   * Do not subscribe to `messages` here. A previous org-wide realtime listener woke every workspace
   * session for every SMS event and then ran the unread-count API. Inbox/thread pages own scoped
   * realtime; the nav badge uses explicit refresh triggers plus a slow fallback interval.
   */
  const tabsHrefKey = allowedTabHrefs?.length ? [...allowedTabHrefs].sort().join("|") : "";
  const tabs = useMemo(() => {
    let t = showLeadsNav ? [...tabsBase.slice(0, 6), leadsTab, ...tabsBase.slice(6)] : tabsBase;
    if (tabsHrefKey && allowedTabHrefs && allowedTabHrefs.length > 0) {
      const allow = new Set(allowedTabHrefs);
      t = t.filter((row) => allow.has(row.href));
    }
    return t;
  }, [showLeadsNav, tabsHrefKey, allowedTabHrefs]);

  /** ActiveCallBar is fixed above the nav; hiding nav during a call avoids double-stack + wrong safe-area math on iPhone. */
  if (status === "in_call") {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-sky-100/80 bg-white/95 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_24px_-8px_rgba(30,58,138,0.07)] backdrop-blur supports-[backdrop-filter]:bg-white/85"
      aria-label="Phone workspace"
    >
      <ul className="mx-auto flex w-full max-w-6xl items-stretch justify-between gap-0.5 px-1 pt-1">
        {tabs.map((t) => {
          const active = isActive(pathname, t.match);
          const isInboxTab = t.href === "/workspace/phone/inbox";
          const inboxUnreadHighlight = isInboxTab && inboxHasUnread && !active;
          return (
            <li key={t.href} className="min-w-0 flex-1">
              <Link
                href={t.href}
                className={`flex flex-col items-center justify-center rounded-xl px-0.5 py-2 text-[10px] font-semibold leading-tight transition sm:text-[11px] ${
                  active
                    ? "bg-phone-nav-active text-phone-navy ring-1 ring-inset ring-phone-border"
                    : inboxUnreadHighlight
                      ? "bg-sky-50/95 text-sky-900 ring-1 ring-inset ring-sky-200/90 hover:bg-sky-100/90"
                      : "text-slate-500 hover:bg-phone-ice/80 hover:text-phone-ink"
                }`}
              >
                <span
                  className={`mb-0.5 flex flex-col items-center ${
                    active ? "text-phone-ink" : inboxUnreadHighlight ? "text-sky-600" : "text-slate-400"
                  }`}
                  title={t.iconTitle}
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

export const NursePhoneBottomNav = memo(NursePhoneBottomNavInner);
