import Link from "next/link";
import type { ReactNode } from "react";

type PhoneAppShellProps = {
  topBar: ReactNode;
  leftRail: ReactNode;
  conversationsPane: ReactNode;
  threadPane: ReactNode;
  crmDrawer: ReactNode;
  dialerPanel: ReactNode;
  mobileHeader: ReactNode;
  mobileInbox: ReactNode;
  mobileThread: ReactNode;
  mobileKeypad: ReactNode;
  mobileBottomNav: ReactNode;
  mobileCallAs: ReactNode;
  mobileCrmSummary: ReactNode;
};

function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm ${className}`}>{children}</section>
  );
}

export function PhoneAppShell(props: PhoneAppShellProps) {
  return (
    <div className="min-h-[calc(100vh-5.5rem)] bg-gradient-to-b from-slate-50 to-white p-3 sm:p-4 lg:p-5">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-3 lg:mb-4">{props.topBar}</div>

        <div className="hidden gap-3 lg:grid lg:grid-cols-[76px_minmax(300px,1fr)_minmax(560px,1.4fr)_340px] lg:items-start">
          <Surface className="sticky top-3 p-2">{props.leftRail}</Surface>
          <Surface className="p-3">{props.conversationsPane}</Surface>
          <Surface className="space-y-3 p-3">
            {props.dialerPanel}
            {props.threadPane}
          </Surface>
          <Surface className="sticky top-3 p-3">{props.crmDrawer}</Surface>
        </div>

        <div className="space-y-3 lg:hidden">
          <Surface className="p-3">{props.mobileHeader}</Surface>
          <Surface className="p-3">{props.mobileCallAs}</Surface>
          <Surface className="p-3">{props.mobileInbox}</Surface>
          <Surface className="p-3">{props.mobileThread}</Surface>
          <Surface className="p-3">{props.mobileCrmSummary}</Surface>
          <Surface className="p-3">{props.mobileKeypad}</Surface>
          <Surface className="p-2">{props.mobileBottomNav}</Surface>
        </div>
      </div>
    </div>
  );
}

export function DesktopPhoneRail() {
  return (
    <nav className="flex h-full flex-col items-center gap-2 pt-1" aria-label="Phone sections">
      <Link
        href="/admin/phone"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white"
        title="Calls"
      >
        C
      </Link>
      <Link
        href="/admin/phone/messages"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
        title="Messages"
      >
        M
      </Link>
      <Link
        href="/admin/phone/dashboard"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
        title="Dashboard"
      >
        D
      </Link>
      <Link
        href="/admin/phone/tasks"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
        title="Tasks"
      >
        T
      </Link>
    </nav>
  );
}
