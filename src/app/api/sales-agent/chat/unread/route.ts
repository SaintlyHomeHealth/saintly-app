import { NextResponse } from "next/server";

import { getStaffProfile, isSalesAgentRole } from "@/lib/staff-profile";
import { salesAgentHasUnreadMessages } from "@/lib/sales-agent/sales-agent-chat";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !isSalesAgentRole(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const hasUnread = await salesAgentHasUnreadMessages(staff.user_id, staff.user_id);
  return NextResponse.json({ hasUnread });
}
