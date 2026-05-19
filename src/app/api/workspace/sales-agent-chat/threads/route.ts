import { NextResponse } from "next/server";

import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { salesAgentChatDebugLog } from "@/lib/sales-agent/sales-agent-chat-debug";
import { listSalesAgentThreadsForWorkspaceChat } from "@/lib/sales-agent/sales-agent-chat";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    salesAgentChatDebugLog("threads API forbidden", {
      hasStaff: Boolean(staff),
      role: staff?.role ?? null,
    });
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const threads = await listSalesAgentThreadsForWorkspaceChat(staff.user_id);
  return NextResponse.json({ threads });
}
