import { NextResponse } from "next/server";

import { getStaffProfile, isSalesAgentRole } from "@/lib/staff-profile";
import { enrichSalesAgentMessagesForViewer, listSalesAgentMessages } from "@/lib/sales-agent/sales-agent-chat";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !isSalesAgentRole(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await listSalesAgentMessages(staff.user_id);
  const messages = await enrichSalesAgentMessagesForViewer(rows, staff.user_id, "You");
  return NextResponse.json({ messages });
}
