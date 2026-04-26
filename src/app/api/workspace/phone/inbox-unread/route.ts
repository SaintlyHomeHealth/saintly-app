import { NextResponse } from "next/server";

import { workspaceInboxHasUnreadInbound } from "@/lib/phone/workspace-inbox-unread";
import { routePerfLog, routePerfStart, routePerfStepsEnabled, routePerfTimed } from "@/lib/perf/route-perf";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * JSON `{ "hasUnread": boolean }` for workspace bottom nav / clients.
 * Mirrors inbox conversation scope (assigned / unassigned rules for nurses).
 */
export async function GET() {
  const perfStart = routePerfStart();
  try {
    const staff = routePerfStepsEnabled()
      ? await routePerfTimed("workspace_inbox_unread_api.staff_profile", getStaffProfile)
      : await getStaffProfile();
    if (!staff || !canAccessWorkspacePhone(staff)) {
      return NextResponse.json({ hasUnread: false }, { status: 200 });
    }

    const supabase = await createServerSupabaseClient();
    const hasUnread = routePerfStepsEnabled()
      ? await routePerfTimed("workspace_inbox_unread_api.has_unread", () =>
          workspaceInboxHasUnreadInbound(staff, supabase)
        )
      : await workspaceInboxHasUnreadInbound(staff, supabase);
    return NextResponse.json({ hasUnread });
  } finally {
    if (perfStart) {
      routePerfLog("api/workspace/phone/inbox-unread", perfStart);
    }
  }
}
