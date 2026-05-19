"use client";

import { SalesAgentThreadPanel } from "@/components/sales-agent/SalesAgentThreadPanel";
import type { SalesAgentMessageView } from "@/lib/sales-agent/sales-agent-chat-types";

type Props = {
  initialMessages: SalesAgentMessageView[];
  viewerUserId: string;
};

export function SalesAgentChatClient({ initialMessages, viewerUserId }: Props) {
  return (
    <SalesAgentThreadPanel
      mode="agent"
      agentUserId={viewerUserId}
      title="Chat with Saintly Admin"
      subtitle="Internal staff messages only — not SMS or email."
      viewerUserId={viewerUserId}
      initialMessages={initialMessages}
      variant="card"
    />
  );
}
