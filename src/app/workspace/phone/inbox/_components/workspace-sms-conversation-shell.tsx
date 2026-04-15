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
  headerAside?: ReactNode;
  /** Status messages (intake / SMS errors) rendered under the header. */
  banners?: ReactNode;
  children: ReactNode;
};

export function WorkspaceSmsConversationShell({
  inboxHref,
  initialDisplayName,
  initialPhoneLine,
  initialBadge,
  workspaceCallHref,
  headerAside,
  banners,
  children,
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [badge, setBadge] = useState(initialBadge);

  const onContactSaved = useCallback((p: ContactSavedPayload) => {
    setDisplayName(p.displayName);
    setBadge(p.badgeLabel);
  }, []);

  return (
    <WorkspaceSmsContactCtx.Provider value={{ onContactSaved }}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-0">
        <header className="shrink-0 border-b border-sky-200/50 bg-white px-4 pb-3 pt-2 shadow-sm shadow-slate-900/[0.04] sm:px-5 sm:pb-3.5 sm:pt-2.5">
          <Link
            href={inboxHref}
            className="inline-flex items-center gap-1 text-[12px] font-semibold tracking-wide text-sky-800/90 transition hover:text-sky-950"
          >
            <ChevronLeft className="h-4 w-4 opacity-80" aria-hidden />
            Inbox
          </Link>
          <div className="mt-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold leading-snug tracking-tight text-slate-950 sm:text-[1.35rem]">
                {displayName}
              </h1>
              <p className="mt-1 font-mono text-[11px] font-normal tabular-nums tracking-tight text-slate-500">
                {initialPhoneLine}
              </p>
              <span className="mt-2 inline-flex items-center rounded-full border border-sky-200/80 bg-sky-50/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900 ring-1 ring-sky-100/70">
                {badge}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
              {workspaceCallHref ? (
                <Link
                  href={workspaceCallHref}
                  className="inline-flex min-h-[2.75rem] min-w-[5.25rem] items-center justify-center rounded-full bg-gradient-to-b from-sky-500 to-blue-700 px-5 text-sm font-semibold text-white shadow-lg shadow-sky-900/20 ring-1 ring-white/25 transition hover:brightness-[1.03] active:scale-[0.98]"
                >
                  Call
                </Link>
              ) : (
                <span className="inline-flex min-h-[2.75rem] min-w-[5.25rem] cursor-not-allowed items-center justify-center rounded-full border border-slate-200/90 bg-slate-50 px-5 text-sm font-semibold text-slate-400">
                  Call
                </span>
              )}
              {headerAside ? <div className="flex flex-col items-end gap-1 text-right">{headerAside}</div> : null}
            </div>
          </div>
        </header>

        {banners}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100/80">
          {children}
        </div>
      </div>
    </WorkspaceSmsContactCtx.Provider>
  );
}
