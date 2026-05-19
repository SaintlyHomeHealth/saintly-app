import { SalesAgentChatClient } from "@/components/sales-agent/SalesAgentChatClient";
import {
  enrichSalesAgentMessagesForViewer,
  listSalesAgentMessages,
  salesAgentDisplayName,
} from "@/lib/sales-agent/sales-agent-chat";
import { requireSalesAgentChatAccess } from "@/lib/sales-agent/sales-agent-workspace-access";

export default async function SalesAgentChatPage() {
  const staff = await requireSalesAgentChatAccess();

  const agentTitle = salesAgentDisplayName({
    user_id: staff.user_id,
    full_name: staff.full_name,
    email: staff.email,
    unread_count: 0,
  });

  const rows = await listSalesAgentMessages(staff.user_id);
  const initialMessages = await enrichSalesAgentMessagesForViewer(rows, staff.user_id, agentTitle);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Chat</h1>
        <p className="mt-1 text-sm text-slate-600">Message Saintly intake staff directly.</p>
      </div>
      <SalesAgentChatClient initialMessages={initialMessages} viewerUserId={staff.user_id} />
    </div>
  );
}
