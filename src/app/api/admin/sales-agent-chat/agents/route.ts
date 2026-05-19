import { NextResponse } from "next/server";

import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { listActiveSalesAgentsForChat } from "@/lib/sales-agent/sales-agent-chat";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const agents = await listActiveSalesAgentsForChat();
  return NextResponse.json({ agents });
}
