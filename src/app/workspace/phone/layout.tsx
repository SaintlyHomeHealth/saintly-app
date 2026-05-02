import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { NursePhoneBottomNav } from "./_components/NursePhoneBottomNav";
import { WorkspacePhoneHeaderActions } from "./_components/WorkspacePhoneHeaderActions";
import { WorkspacePhoneHeaderBranding } from "./_components/WorkspacePhoneHeaderBranding";
import { WorkspacePhoneHeaderChrome } from "./_components/WorkspacePhoneHeaderChrome";
import { WorkspacePhoneMainPad } from "./_components/WorkspacePhoneMainPad";
import { WorkspacePhoneTopStatusStrip } from "./_components/WorkspacePhoneTopStatusStrip";
import {
  routePerfLog,
  routePerfStart,
  routePerfStepsEnabled,
  routePerfTimed,
} from "@/lib/perf/route-perf";
import { allowedWorkspaceTabHrefs, resolveEffectivePageAccess } from "@/lib/staff-page-access";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function WorkspacePhoneLayout({ children }: { children: ReactNode }) {
  const perfStart = routePerfStart();
  try {
    const staff = routePerfStepsEnabled()
      ? await routePerfTimed("workspace_phone_layout.staff_profile", getStaffProfile)
      : await getStaffProfile();
    if (!staff) {
      redirect("/admin/phone");
    }

    const displayName =
      (typeof staff.full_name === "string" && staff.full_name.trim()) ||
      (typeof staff.email === "string" && staff.email.trim()) ||
      "Staff";

    const showAdminLink =
      isManagerOrHigher(staff) || (staff.role === "nurse" && staff.admin_shell_access === true);
    const access = resolveEffectivePageAccess(staff);
    const allowedTabs = allowedWorkspaceTabHrefs(access);

    /**
     * Unread badge hydrates client-side (`NursePhoneBottomNav` hits `/api/workspace/phone/inbox-unread`
     * on idle/focus). Skipping the layout DB scan removes a blocking round-trip on every tab navigation.
     */

    return (
      <div className="ws-phone-page-shell flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-x-hidden text-slate-900">
        <WorkspacePhoneHeaderChrome>
          <div className="mx-auto flex w-full max-w-none items-center justify-between gap-2 lg:gap-2">
            <WorkspacePhoneHeaderBranding displayName={displayName} />
            <WorkspacePhoneHeaderActions showAdminLink={showAdminLink} />
          </div>
        </WorkspacePhoneHeaderChrome>

        <WorkspacePhoneTopStatusStrip
          displayName={displayName}
          inboundRingEnabled={staff.inbound_ring_enabled}
        />

        <WorkspacePhoneMainPad>{children}</WorkspacePhoneMainPad>

        <NursePhoneBottomNav showLeadsNav={showAdminLink} allowedTabHrefs={allowedTabs} initialInboxHasUnread={false} />
      </div>
    );
  } finally {
    if (perfStart) {
      routePerfLog("workspace/phone/layout", perfStart);
    }
  }
}
