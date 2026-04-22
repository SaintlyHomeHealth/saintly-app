import { NextResponse } from "next/server";

import { workspaceInboxHasUnreadInbound } from "@/lib/phone/workspace-inbox-unread";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * JSON `{ "hasUnread": boolean }` for workspace bottom nav / clients.
 * Mirrors inbox conversation scope (assigned / unassigned rules for nurses).
 */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ hasUnread: false }, { status: 200 });
  }

  const supabase = await createServerSupabaseClient();
  const hasUnread = await workspaceInboxHasUnreadInbound(staff, supabase);
  return NextResponse.json({ hasUnread });
}
