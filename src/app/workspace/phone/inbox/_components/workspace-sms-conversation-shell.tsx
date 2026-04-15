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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-28 sm:pb-32">
        <header className="sticky top-0 z-20 shrink-0 border-b border-sky-200/50 bg-gradient-to-b from-white via-white to-sky-50/40 px-4 pb-4 pt-3 shadow-[0_8px_28px_-14px_rgba(15,23,42,0.1)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/90 sm:px-5 sm:pb-5">
          <Link
            href={inboxHref}
            className="inline-flex items-center gap-1 text-[13px] font-semibold tracking-wide text-sky-800/90 transition hover:text-sky-950"
          >
            <ChevronLeft className="h-4 w-4 opacity-80" aria-hidden />
            Inbox
          </Link>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-[1.65rem]">
                {displayName}
              </h1>
              <p className="mt-1.5 font-mono text-[12px] font-normal tabular-nums tracking-tight text-slate-500">
                {initialPhoneLine}
              </p>
              <span className="mt-3 inline-flex items-center rounded-full border border-sky-200/80 bg-gradient-to-r from-sky-50 to-cyan-50/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-900 shadow-sm shadow-sky-900/5 ring-1 ring-sky-100/80">
                {badge}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2.5 pt-0.5">
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

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-slate-100/90 via-sky-50/35 to-[#f4f8fc]">
          {children}
        </div>
      </div>
    </WorkspaceSmsContactCtx.Provider>
  );
}
