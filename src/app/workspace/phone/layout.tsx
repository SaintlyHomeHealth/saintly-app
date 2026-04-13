import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { NursePhoneBottomNav } from "./_components/NursePhoneBottomNav";
import { WorkspacePhoneMainPad } from "./_components/WorkspacePhoneMainPad";
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
      <div className="ws-phone-page-shell flex min-h-[100dvh] flex-col text-slate-900">
        <header className="sticky top-0 z-30 border-b border-sky-100/70 bg-white/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] shadow-[0_4px_24px_-12px_rgba(30,58,138,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-phone-ink/70">Saintly Phone</p>
              <p className="truncate text-sm font-semibold text-phone-navy">{displayName}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {showAdminLink ? (
                <Link
                  href="/admin/phone"
                  className="rounded-full border border-sky-200/90 bg-white px-3 py-2 text-xs font-semibold text-phone-ink shadow-sm transition hover:bg-phone-ice min-[480px]:px-3.5"
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

        <WorkspacePhoneMainPad>{children}</WorkspacePhoneMainPad>

        <NursePhoneBottomNav showLeadsNav={showAdminLink} />
      </div>
    );
  } finally {
    if (perfStart) {
      routePerfLog("workspace/phone/layout", perfStart);
    }
  }
}
