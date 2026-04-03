import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { NursePhoneBottomNav } from "./_components/NursePhoneBottomNav";
import { WorkspacePhoneTopStatusStrip } from "./_components/WorkspacePhoneTopStatusStrip";
import { SignOutButton } from "@/components/SignOutButton";
import { routePerfLog, routePerfStart } from "@/lib/perf/route-perf";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function WorkspacePhoneLayout({ children }: { children: ReactNode }) {
  const perfStart = routePerfStart();
  try {
    const staff = await getStaffProfile();
    if (!staff) {
      redirect("/admin/phone");
    }

    const displayName =
      (typeof staff.full_name === "string" && staff.full_name.trim()) ||
      (typeof staff.email === "string" && staff.email.trim()) ||
      "Staff";

    const showAdminLink = isManagerOrHigher(staff);

    return (
      <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-slate-50 via-white to-slate-50/80 text-slate-900">
        <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/95 px-4 py-3 shadow-sm shadow-slate-200/20 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-900/55">Saintly Phone</p>
              <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {showAdminLink ? (
                <Link
                  href="/admin/phone"
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 min-[480px]:px-3.5"
                >
                  Admin
                </Link>
              ) : null}
              <SignOutButton
                label="Log out"
                className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-slate-900/15 transition hover:bg-slate-800 disabled:opacity-50"
              />
            </div>
          </div>
        </header>

        <WorkspacePhoneTopStatusStrip
          displayName={displayName}
          inboundRingEnabled={staff.inbound_ring_enabled}
        />

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col pb-32">{children}</main>

        <NursePhoneBottomNav showLeadsNav={showAdminLink} />
      </div>
    );
  } finally {
    if (perfStart) {
      routePerfLog("workspace/phone/layout", perfStart);
    }
  }
}
