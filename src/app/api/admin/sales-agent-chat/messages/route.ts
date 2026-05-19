import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import {
  enrichSalesAgentMessagesForViewer,
  listSalesAgentMessages,
  salesAgentDisplayName,
} from "@/lib/sales-agent/sales-agent-chat";

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

  const { data: agentRow } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email, role")
    .eq("user_id", agentUserId)
    .eq("role", "sales_agent")
    .maybeSingle();

  if (!agentRow?.user_id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const agentTitle = salesAgentDisplayName({
    user_id: agentUserId,
    full_name: typeof agentRow.full_name === "string" ? agentRow.full_name : null,
    email: typeof agentRow.email === "string" ? agentRow.email : null,
    unread_count: 0,
  });

  const rows = await listSalesAgentMessages(agentUserId);
  const messages = await enrichSalesAgentMessagesForViewer(rows, staff.user_id, agentTitle);
  return NextResponse.json({ messages });
}
