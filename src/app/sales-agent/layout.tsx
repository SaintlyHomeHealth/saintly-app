import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getStaffProfile, isSalesAgentRole } from "@/lib/staff-profile";

export default async function SalesAgentLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffProfile();
  if (!staff) {
    redirect("/login?next=/sales-agent/leads");
  }
  if (!isSalesAgentRole(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }

  const displayName = (staff.full_name ?? staff.email ?? "Sales Agent").trim();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Saintly Home Health</p>
            <h1 className="truncate text-base font-semibold text-slate-900">Sales Agent Portal</h1>
          </div>
          <nav className="flex shrink-0 items-center gap-2 text-sm">
            <Link
              href="/sales-agent/leads"
              className="rounded-full px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
            >
              Dashboard
            </Link>
            <Link
              href="/sales-agent/leads/new"
              className="rounded-full bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-700"
            >
              Create Order / Lead
            </Link>
            <span className="hidden text-xs text-slate-500 sm:inline">{displayName}</span>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
