import { NextResponse } from "next/server";

import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { listSalesAgentMessages } from "@/lib/sales-agent/sales-agent-chat";

export async function GET(request: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const agentUserId = url.searchParams.get("agentUserId")?.trim() ?? "";
  if (!agentUserId) {
    return NextResponse.json({ error: "agentUserId required" }, { status: 400 });
  }

  const messages = await listSalesAgentMessages(agentUserId);
  return NextResponse.json({ messages });
}
