import { redirect } from "next/navigation";

import { AdminSalesAgentChatClient } from "./_components/AdminSalesAgentChatClient";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import {
  listActiveSalesAgentsForChat,
  listSalesAgentMessages,
} from "@/lib/sales-agent/sales-agent-chat";

export default async function AdminSalesAgentChatPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const agents = await listActiveSalesAgentsForChat();
  const initialAgentUserId =
    (typeof sp.agent === "string" && sp.agent.trim()) || agents[0]?.user_id || null;
  const initialMessages = initialAgentUserId
    ? await listSalesAgentMessages(initialAgentUserId)
    : [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Sales Agent Chat</h1>
        <p className="mt-1 text-sm text-slate-600">
          Internal messages with sales agents. Not SMS, email, or patient-facing communication.
        </p>
      </div>
      <AdminSalesAgentChatClient
        agents={agents}
        initialAgentUserId={initialAgentUserId}
        initialMessages={initialMessages}
        viewerUserId={staff.user_id}
      />
    </div>
  );
}
