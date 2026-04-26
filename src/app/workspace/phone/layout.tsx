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
import { workspaceInboxHasUnreadInbound } from "@/lib/phone/workspace-inbox-unread";
import { allowedWorkspaceTabHrefs, resolveEffectivePageAccess } from "@/lib/staff-page-access";
import { canAccessWorkspacePhone, getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

    let initialInboxHasUnread = false;
    if (canAccessWorkspacePhone(staff)) {
      const supabase = await createServerSupabaseClient();
      initialInboxHasUnread = routePerfStepsEnabled()
        ? await routePerfTimed("workspace_phone_layout.initial_unread", () =>
            workspaceInboxHasUnreadInbound(staff, supabase)
          )
        : await workspaceInboxHasUnreadInbound(staff, supabase);
    }

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

        <NursePhoneBottomNav
          showLeadsNav={showAdminLink}
          allowedTabHrefs={allowedTabs}
          initialInboxHasUnread={initialInboxHasUnread}
        />
      </div>
    );
  } finally {
    if (perfStart) {
      routePerfLog("workspace/phone/layout", perfStart);
    }
  }
}
