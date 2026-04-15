"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/components/SignOutButton";

type Props = { showAdminLink: boolean };

export function WorkspacePhoneHeaderActions({ showAdminLink }: Props) {
  const pathname = usePathname() ?? "";
  const inboxListDesktop = pathname === "/workspace/phone/inbox";

  const adminClass = inboxListDesktop
    ? "rounded-full border border-sky-200/90 bg-white px-3 py-2 text-xs font-semibold text-phone-ink shadow-sm transition hover:bg-phone-ice min-[480px]:px-3.5 lg:px-2.5 lg:py-1 lg:text-[11px] lg:shadow-none"
    : "rounded-full border border-sky-200/90 bg-white px-3 py-2 text-xs font-semibold text-phone-ink shadow-sm transition hover:bg-phone-ice min-[480px]:px-3.5";

  const signOutClass = inboxListDesktop
    ? "rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-slate-900/15 transition hover:bg-slate-800 disabled:opacity-50 lg:px-3 lg:py-1 lg:text-xs lg:shadow-none"
    : "rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-slate-900/15 transition hover:bg-slate-800 disabled:opacity-50";

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
