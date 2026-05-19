import { SalesAgentChatClient } from "@/components/sales-agent/SalesAgentChatClient";
import { listSalesAgentMessages } from "@/lib/sales-agent/sales-agent-chat";
import { requireSalesAgentChatAccess } from "@/lib/sales-agent/sales-agent-workspace-access";

export default async function SalesAgentChatPage() {
  const staff = await requireSalesAgentChatAccess();

  const messages = await listSalesAgentMessages(staff.user_id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Chat</h1>
        <p className="mt-1 text-sm text-slate-600">Message Saintly intake staff directly.</p>
      </div>
      <SalesAgentChatClient initialMessages={messages} viewerUserId={staff.user_id} />
    </div>
  );
}
