"use client";

import { useWorkspacePhoneInCallLayout } from "@/components/softphone/WorkspaceSoftphoneContext";
import {
  routePerfClientNavTapToPush,
  routePerfEnabled,
  routePerfRenderCount,
  routePerfStart,
} from "@/lib/perf/route-perf";
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
import { usePathname, useRouter } from "next/navigation";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

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

const NAV_ACTIVE_CLASS = "bg-phone-nav-active text-phone-navy ring-1 ring-inset ring-phone-border";
const NAV_INBOX_UNREAD_CLASS =
  "bg-sky-50/95 text-sky-900 ring-1 ring-inset ring-sky-200/90 hover:bg-sky-100/90";
const NAV_IDLE_CLASS = "text-slate-500 hover:bg-phone-ice/80 hover:text-phone-ink";
const NAV_ICON_ACTIVE_CLASS = "text-phone-ink";
const NAV_ICON_UNREAD_CLASS = "text-sky-600";
const NAV_ICON_IDLE_CLASS = "text-slate-400";

const NavTabButton = memo(function NavTabButton({
  tab,
  active,
  inboxUnreadHighlight,
  onNavigate,
}: {
  tab: Tab;
  active: boolean;
  inboxUnreadHighlight: boolean;
  onNavigate: (href: string) => void;
}) {
  const handleClick = useCallback(() => {
    onNavigate(tab.href);
  }, [onNavigate, tab.href]);

  const surfaceClass = active ? NAV_ACTIVE_CLASS : inboxUnreadHighlight ? NAV_INBOX_UNREAD_CLASS : NAV_IDLE_CLASS;
  const iconClass = active ? NAV_ICON_ACTIVE_CLASS : inboxUnreadHighlight ? NAV_ICON_UNREAD_CLASS : NAV_ICON_IDLE_CLASS;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex w-full flex-col items-center justify-center rounded-xl px-0.5 py-2 text-[10px] font-semibold leading-tight sm:text-[11px] ${surfaceClass}`}
    >
      <span
        className={`mb-0.5 flex flex-col items-center [&_svg]:pointer-events-none ${iconClass}`}
        title={tab.iconTitle}
      >
        {tab.icon}
      </span>
      {tab.label}
    </button>
  );
});

function NursePhoneBottomNavInner({
  showLeadsNav = true,
  allowedTabHrefs = null,
  initialInboxHasUnread = false,
}: NavProps) {
  routePerfRenderCount("NursePhoneBottomNav");
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const inCallLayout = useWorkspacePhoneInCallLayout();
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
        const next = Boolean(json.hasUnread);
        setInboxHasUnread((prev) => (prev === next ? prev : next));
      } catch {
        /* ignore */
      } finally {
        if (perfStart && routePerfEnabled()) {
          const ms = Date.now() - perfStart;
          console.info(`[route-perf] client workspace_nav:inbox-unread-fetch total=${ms.toFixed(0)}ms`);
        }
        unreadRefreshInFlightRef.current = null;
      }
    })();
    unreadRefreshInFlightRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    const next = Boolean(initialInboxHasUnread);
    setInboxHasUnread((prev) => (prev === next ? prev : next));
  }, [initialInboxHasUnread]);

  /** Defer unread refresh off the navigation critical path (was tying fetches to every pathname). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      void refreshInboxUnread({ force: true });
    };
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout: 3000 });
    } else {
      timeoutId = window.setTimeout(run, 400);
    }
    return () => {
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [pathname, refreshInboxUnread]);

  useEffect(() => {
    router.prefetch("/workspace/phone/inbox");
    router.prefetch("/workspace/phone/keypad");
  }, [router]);

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

  const pushTab = useCallback(
    (href: string) => {
      const t0 = typeof performance !== "undefined" ? performance.now() : 0;
      startTransition(() => {
        router.push(href);
      });
      routePerfClientNavTapToPush(t0);
    },
    [router]
  );

  /*
   * Do not subscribe to `messages` here. A previous org-wide realtime listener woke every workspace
   * session for every SMS event and then ran the unread-count API. Inbox/thread pages own scoped
   * realtime; the nav badge uses explicit refresh triggers plus a slow fallback interval.
   */
  const tabsHrefKey = useMemo(
    () => (allowedTabHrefs?.length ? [...allowedTabHrefs].sort().join("|") : ""),
    [allowedTabHrefs]
  );
  const tabs = useMemo(() => {
    let t = showLeadsNav ? [...tabsBase.slice(0, 6), leadsTab, ...tabsBase.slice(6)] : tabsBase;
    if (tabsHrefKey) {
      const allow = new Set(tabsHrefKey.split("|"));
      t = t.filter((row) => allow.has(row.href));
    }
    return t;
  }, [showLeadsNav, tabsHrefKey]);

  /** ActiveCallBar is fixed above the nav; hiding nav during a call avoids double-stack + wrong safe-area math on iPhone. */
  if (inCallLayout) {
    return null;
  }

  return (
    <nav
      className="nurse-phone-bottom-nav pointer-events-auto fixed bottom-0 left-0 right-0 z-40 border-t border-sky-100/80 bg-white/95 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_24px_-8px_rgba(30,58,138,0.07)] backdrop-blur supports-[backdrop-filter]:bg-white/85"
      aria-label="Phone workspace"
    >
      <ul className="mx-auto flex w-full max-w-6xl items-stretch justify-between gap-0.5 px-1 pt-1">
        {tabs.map((t) => {
          const active = isActive(pathname, t.match);
          const isInboxTab = t.href === "/workspace/phone/inbox";
          const inboxUnreadHighlight = isInboxTab && inboxHasUnread && !active;
          return (
            <li key={t.href} className="min-w-0 flex-1">
              <NavTabButton
                tab={t}
                active={active}
                inboxUnreadHighlight={inboxUnreadHighlight}
                onNavigate={pushTab}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const NursePhoneBottomNav = memo(NursePhoneBottomNavInner);
