"use client";

import {
  CalendarDays,
  Hash,
  Inbox,
  Phone,
  PhoneForwarded,
  UserPlus,
  Users,
  Voicemail,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Tab = {
  href: string;
  label: ReactNode;
  match: RegExp;
  icon: ReactNode;
  iconTitle: string;
};

const iconWrap = "flex h-8 w-8 items-center justify-center rounded-xl border border-transparent";

const tabs: Tab[] = [
  {
    href: "/workspace/phone/today",
    label: "Today",
    match: /^\/workspace\/phone\/today$|^\/workspace\/phone$/,
    icon: (
      <span className={iconWrap}>
        <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Today",
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
    icon: (
      <span className={iconWrap}>
        <PhoneForwarded className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Follow-ups today",
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
    href: "/workspace/phone/leads",
    label: "Leads",
    match: /^\/workspace\/phone\/leads/,
    icon: (
      <span className={iconWrap}>
        <UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    ),
    iconTitle: "Leads",
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
];

function isActive(pathname: string, match: RegExp): boolean {
  return match.test(pathname);
}

export function NursePhoneBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_rgba(0,0,0,0.04)] backdrop-blur supports-[backdrop-filter]:bg-white/80"
      aria-label="Phone workspace"
    >
      <ul className="mx-auto flex w-full max-w-6xl items-stretch justify-between gap-0.5 px-1 pt-1">
        {tabs.map((t) => {
          const active = isActive(pathname, t.match);
          return (
            <li key={t.href} className="min-w-0 flex-1">
              <Link
                href={t.href}
                className={`flex flex-col items-center justify-center rounded-xl px-0.5 py-2 text-[10px] font-semibold leading-tight transition sm:text-[11px] ${
                  active ? "bg-sky-50 text-sky-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <span
                  className={`mb-0.5 flex flex-col items-center ${active ? "text-sky-700" : "text-slate-400"}`}
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
