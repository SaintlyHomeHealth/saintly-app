"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/components/SignOutButton";

type Props = { showAdminLink: boolean };

export function WorkspacePhoneHeaderActions({ showAdminLink }: Props) {
  const pathname = usePathname() ?? "";
  const inboxListDesktop = pathname === "/workspace/phone/inbox";

  const adminClass = inboxListDesktop
    ? "rounded-full border border-sky-200/80 bg-white px-2 py-1 text-[11px] font-medium text-phone-ink/90 shadow-none transition hover:bg-phone-ice md:px-2.5 md:py-1.5 md:text-xs md:font-semibold lg:px-2.5 lg:py-1 lg:text-[11px] lg:shadow-none"
    : "rounded-full border border-sky-200/80 bg-white px-2 py-1 text-[11px] font-medium text-phone-ink/90 shadow-none transition hover:bg-phone-ice md:px-3 md:py-1.5 md:text-xs md:font-semibold md:shadow-sm min-[480px]:px-3.5";

  const signOutClass = inboxListDesktop
    ? "rounded-full border border-slate-700/90 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-none transition hover:bg-slate-800 disabled:opacity-50 md:px-3 md:py-1.5 md:text-xs lg:px-3 lg:py-1 lg:shadow-none"
    : "rounded-full border border-slate-700/90 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-none transition hover:bg-slate-800 disabled:opacity-50 md:px-4 md:py-2 md:text-sm md:shadow-md md:shadow-slate-900/15";

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
      {showAdminLink ? (
        <Link href="/admin/phone" className={adminClass}>
          Admin
        </Link>
      ) : null}
      <SignOutButton label="Log out" className={signOutClass} />
    </div>
  );
}
