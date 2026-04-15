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
              : "border-sky-200/50 px-4 pb-3 pt-2 shadow-sm shadow-slate-900/[0.04] sm:px-5 sm:pb-3.5 sm:pt-2.5"
          }`}
        >
          <Link
            href={inboxHref}
            className={`inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold tracking-wide text-sky-800/90 transition hover:text-sky-950 ${
              appDesktopSplit ? "lg:py-0.5" : ""
            }`}
          >
            <ChevronLeft className="h-4 w-4 opacity-80" aria-hidden />
            Inbox
          </Link>
          <div
            className={`flex items-start justify-between gap-3 ${appDesktopSplit ? "mt-1.5 lg:mt-0 lg:min-w-0 lg:flex-1 lg:items-center lg:gap-3" : "mt-2.5"}`}
          >
            <div
              className={`min-w-0 flex-1 ${appDesktopSplit ? "flex flex-col gap-0 lg:flex-row lg:items-center lg:gap-2" : ""}`}
            >
              <h1
                className={`truncate font-semibold leading-snug tracking-tight text-slate-950 ${
                  appDesktopSplit ? "text-lg lg:text-sm" : "text-xl sm:text-[1.35rem]"
                }`}
              >
                {displayName}
              </h1>
              <p
                className={`mt-1 font-mono text-[11px] font-normal tabular-nums tracking-tight text-slate-500 ${
                  appDesktopSplit ? "lg:mt-0 lg:shrink-0" : ""
                }`}
              >
                {initialPhoneLine}
              </p>
              <span
                className={`inline-flex w-fit max-w-full items-center rounded-full border border-sky-200/80 bg-sky-50/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900 ring-1 ring-sky-100/70 ${
                  appDesktopSplit ? "mt-1.5 lg:mt-0 lg:shrink-0 lg:truncate lg:py-px lg:ring-0" : "mt-2"
                }`}
              >
                {badge}
              </span>
            </div>
            <div
              className={`flex shrink-0 flex-col items-end gap-2 pt-0.5 ${
                appDesktopSplit ? "lg:flex-row lg:items-center lg:gap-2 lg:pt-0" : ""
              }`}
            >
              {workspaceCallHref ? (
                <Link
                  href={workspaceCallHref}
                  className={`inline-flex min-h-[2.75rem] min-w-[5.25rem] items-center justify-center rounded-full bg-gradient-to-b from-sky-500 to-blue-700 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-900/20 ring-1 ring-white/25 transition hover:brightness-[1.03] active:scale-[0.98] ${
                    appDesktopSplit
                      ? "lg:min-h-0 lg:min-w-[4.25rem] lg:rounded-md lg:px-4 lg:py-1.5 lg:text-xs lg:shadow-none lg:ring-0"
                      : ""
                  }`}
                >
                  Call
                </Link>
              ) : (
                <span
                  className={`inline-flex min-h-[2.75rem] min-w-[5.25rem] cursor-not-allowed items-center justify-center rounded-full border border-slate-200/90 bg-slate-50 px-5 text-sm font-semibold text-slate-400 ${
                    appDesktopSplit ? "lg:min-h-0 lg:min-w-[4.25rem] lg:rounded-md lg:px-4 lg:py-1.5 lg:text-xs" : ""
                  }`}
                >
                  Call
                </span>
              )}
              {headerAside ? (
                <div className="flex flex-col items-end gap-1 text-right lg:text-xs">{headerAside}</div>
              ) : null}
            </div>
          </div>
        </header>

        {banners}

        <div
          className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${
            appDesktopSplit ? "bg-white" : "bg-slate-100/80"
          }`}
        >
          {children}
        </div>
      </div>
    </WorkspaceSmsContactCtx.Provider>
  );
}
