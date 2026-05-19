import { redirect } from "next/navigation";

import { SalesAgentThreadPanel } from "@/components/sales-agent/SalesAgentThreadPanel";
import { supabaseAdmin } from "@/lib/admin";
import {
  enrichSalesAgentMessagesForViewer,
  listSalesAgentMessages,
  salesAgentDisplayName,
} from "@/lib/sales-agent/sales-agent-chat";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { canUseWorkspacePhoneAppShell, getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function WorkspaceSalesAgentChatThreadPage({
  params,
}: {
  params: Promise<{ agentUserId: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !canUseWorkspacePhoneAppShell(staff) || !canAccessWorkspaceInternalChat(staff)) {
    redirect("/admin/phone");
  }
  if (!isManagerOrHigher(staff)) {
    redirect("/workspace/phone/chat");
  }

  const { agentUserId } = await params;
  const id = typeof agentUserId === "string" ? agentUserId.trim() : "";
  if (!id) {
    redirect("/workspace/phone/chat");
  }

  const { data: agentRow } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email, role")
    .eq("user_id", id)
    .eq("role", "sales_agent")
    .maybeSingle();

  if (!agentRow?.user_id) {
    redirect("/workspace/phone/chat");
  }

  const agentTitle = salesAgentDisplayName({
    user_id: id,
    full_name: typeof agentRow.full_name === "string" ? agentRow.full_name : null,
    email: typeof agentRow.email === "string" ? agentRow.email : null,
    unread_count: 0,
  });

  const rows = await listSalesAgentMessages(id);
  const initialMessages = await enrichSalesAgentMessagesForViewer(rows, staff.user_id, agentTitle);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SalesAgentThreadPanel
        mode="manager"
        agentUserId={id}
        title={agentTitle}
        subtitle="Sales Agent · internal staff chat"
        viewerUserId={staff.user_id}
        initialMessages={initialMessages}
        backHref="/workspace/phone/chat"
        variant="workspace"
      />
    </div>
  );
}
