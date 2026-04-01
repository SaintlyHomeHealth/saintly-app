"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Tab = {
  href: string;
  label: ReactNode;
  match: RegExp;
  icon: string;
  iconTitle: string;
};

const tabs: Tab[] = [
  {
    href: "/workspace/phone/today",
    label: "Today",
    match: /^\/workspace\/phone\/today/,
    icon: "1",
    iconTitle: "Today view",
  },
  {
    href: "/workspace/phone/follow-ups-today",
    label: (
      <span className="block text-center leading-[1.15]">
        Follow-ups
        <br />
        Today
      </span>
    ),
    match: /^\/workspace\/phone\/follow-ups-today/,
    icon: "!",
    iconTitle: "Follow-ups today",
  },
  { href: "/workspace/phone/inbox", label: "Inbox", match: /^\/workspace\/phone\/inbox/, icon: "I", iconTitle: "Inbox" },
  { href: "/workspace/phone/calls", label: "Calls", match: /^\/workspace\/phone\/calls/, icon: "C", iconTitle: "Calls" },
  {
    href: "/workspace/phone/voicemail",
    label: "Voicemail",
    match: /^\/workspace\/phone\/voicemail/,
    icon: "V",
    iconTitle: "Voicemail",
  },
  {
    href: "/workspace/phone/patients",
    label: "Patients",
    match: /^\/workspace\/phone\/patients/,
    icon: "P",
    iconTitle: "Patients",
  },
  {
    href: "/workspace/phone/leads",
    label: "Leads",
    match: /^\/workspace\/phone\/leads/,
    icon: "L",
    iconTitle: "Leads",
  },
  { href: "/workspace/phone/keypad", label: "Keypad", match: /^\/workspace\/phone\/keypad/, icon: "K", iconTitle: "Keypad" },
];

function isActive(pathname: string, match: RegExp): boolean {
  return match.test(pathname);
}

export function NursePhoneBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-white/70"
      aria-label="Phone workspace"
    >
      <ul className="mx-auto flex w-full max-w-6xl items-stretch justify-between gap-1 px-2 pt-1">
        {tabs.map((t) => {
          const active = isActive(pathname, t.match);
          return (
            <li key={t.href} className="min-w-0 flex-1">
              <Link
                href={t.href}
                className={`flex flex-col items-center justify-center rounded-xl px-1 py-2 text-[11px] font-semibold transition ${
                  active ? "bg-sky-50 text-sky-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <span
                  className={`mb-0.5 h-1 w-8 rounded-full ${active ? "bg-sky-600" : "bg-transparent"}`}
                  aria-hidden
                />
                <span
                  className="mb-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border border-current text-[8px] leading-none"
                  aria-hidden
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
