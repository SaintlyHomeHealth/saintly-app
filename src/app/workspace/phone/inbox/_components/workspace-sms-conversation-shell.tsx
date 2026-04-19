"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ContactSavedPayload = { displayName: string; badgeLabel: string };

const WorkspaceSmsContactCtx = createContext<{
  onContactSaved: (p: ContactSavedPayload) => void;
} | null>(null);

export function useWorkspaceSmsContactSave() {
  return useContext(WorkspaceSmsContactCtx);
}

type Props = {
  inboxHref: string;
  initialDisplayName: string;
  initialPhoneLine: string;
  initialBadge: string;
  workspaceCallHref: string | null;
  /** Identifies the thread root for mark-as-read (interaction + visibility). */
  smsThreadPaneId: string;
  headerAside?: ReactNode;
  /** Status messages (intake / SMS errors) rendered under the header. */
  banners?: ReactNode;
  children: ReactNode;
  /** Desktop 3-pane inbox: flat full-bleed chrome (no card-like shell). */
  appDesktopSplit?: boolean;
};

export function WorkspaceSmsConversationShell({
  inboxHref,
  initialDisplayName,
  initialPhoneLine,
  initialBadge,
  workspaceCallHref,
  smsThreadPaneId,
  headerAside,
  banners,
  children,
  appDesktopSplit = false,
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [badge, setBadge] = useState(initialBadge);

  const onContactSaved = useCallback((p: ContactSavedPayload) => {
    setDisplayName(p.displayName);
    setBadge(p.badgeLabel);
  }, []);

  return (
    <WorkspaceSmsContactCtx.Provider value={{ onContactSaved }}>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0"
        data-sms-thread-pane={smsThreadPaneId}
      >
        <header
          className={`shrink-0 border-b bg-white ${
            appDesktopSplit
              ? "border-slate-200 px-3 pb-2.5 pt-2 shadow-none lg:flex lg:h-10 lg:min-h-0 lg:items-center lg:gap-3 lg:px-3 lg:py-0"
              : "border-slate-200/60 px-3 pb-1.5 pt-1 sm:px-5 sm:pb-3 sm:pt-2.5 sm:shadow-sm sm:shadow-slate-900/[0.03]"
          }`}
        >
          <Link
            href={inboxHref}
            className={`inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold tracking-wide text-sky-800/90 transition hover:text-sky-950 sm:gap-1 sm:text-[12px] ${
              appDesktopSplit ? "lg:py-0.5" : ""
            }`}
          >
            <ChevronLeft className="h-4 w-4 opacity-80" aria-hidden />
            Inbox
          </Link>
          <div
            className={`flex items-start justify-between gap-2 sm:gap-3 ${appDesktopSplit ? "mt-1.5 lg:mt-0 lg:min-w-0 lg:flex-1 lg:items-center lg:gap-3" : "mt-1.5 sm:mt-2.5"}`}
          >
            <div
              className={`min-w-0 flex-1 ${appDesktopSplit ? "flex flex-col gap-0 lg:flex-row lg:items-center lg:gap-2" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <h1
                  className={`min-w-0 truncate font-semibold leading-snug tracking-tight text-slate-950 ${
                    appDesktopSplit ? "text-lg lg:text-sm" : "text-[1.05rem] sm:text-xl sm:text-[1.35rem]"
                  }`}
                >
                  {displayName}
                </h1>
                <span
                  className={`inline-flex max-w-full items-center rounded-full border border-sky-200/70 bg-sky-50/90 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-sky-900/95 ring-1 ring-sky-100/60 sm:px-2.5 sm:py-0.5 sm:text-[10px] ${
                    appDesktopSplit ? "mt-1.5 lg:mt-0 lg:shrink-0 lg:truncate lg:py-px lg:ring-0" : ""
                  }`}
                >
                  {badge}
                </span>
              </div>
              <p
                className={`mt-0.5 font-mono text-[10px] font-normal tabular-nums tracking-tight text-slate-500 sm:mt-1 sm:text-[11px] ${
                  appDesktopSplit ? "lg:mt-0 lg:shrink-0" : ""
                }`}
              >
                {initialPhoneLine}
              </p>
            </div>
            <div
              className={`flex shrink-0 flex-col items-end gap-1.5 pt-0.5 sm:gap-2 ${
                appDesktopSplit ? "lg:flex-row lg:items-center lg:gap-2 lg:pt-0" : ""
              }`}
            >
              {workspaceCallHref ? (
                <Link
                  href={workspaceCallHref}
                  className={`inline-flex min-h-[2.25rem] min-w-[4rem] items-center justify-center rounded-full bg-gradient-to-b from-sky-500 to-blue-700 px-4 text-xs font-semibold text-white shadow-md shadow-sky-900/20 ring-1 ring-white/25 transition hover:brightness-[1.03] active:scale-[0.98] sm:min-h-[2.75rem] sm:min-w-[5.25rem] sm:px-5 sm:text-sm sm:shadow-lg ${
                    appDesktopSplit
                      ? "lg:min-h-0 lg:min-w-[4.25rem] lg:rounded-md lg:px-4 lg:py-1.5 lg:text-xs lg:shadow-none lg:ring-0"
                      : ""
                  }`}
                >
                  Call
                </Link>
              ) : (
                <span
                  className={`inline-flex min-h-[2.25rem] min-w-[4rem] cursor-not-allowed items-center justify-center rounded-full border border-slate-200/90 bg-slate-50 px-4 text-xs font-semibold text-slate-400 sm:min-h-[2.75rem] sm:min-w-[5.25rem] sm:px-5 sm:text-sm ${
                    appDesktopSplit ? "lg:min-h-0 lg:min-w-[4.25rem] lg:rounded-md lg:px-4 lg:py-1.5 lg:text-xs" : ""
                  }`}
                >
                  Call
                </span>
              )}
              {headerAside ? (
                <div className="flex flex-col items-end gap-1 text-right text-[11px] lg:text-xs">{headerAside}</div>
              ) : null}
            </div>
          </div>
        </header>

        {banners}

        <div
          className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${
            appDesktopSplit ? "bg-white" : "bg-slate-50/90"
          }`}
        >
          {children}
        </div>
      </div>
    </WorkspaceSmsContactCtx.Provider>
  );
}
