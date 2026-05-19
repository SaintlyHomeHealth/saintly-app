export type SalesAgentMessageRow = {
  id: string;
  sales_agent_user_id: string;
  sender_user_id: string;
  sender_role: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type SalesAgentChatAgentOption = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  unread_count: number;
};

/** Workspace Chat list row for manager/admin Sales Agent threads. */
export type SalesAgentWorkspaceChatListItem = {
  agentUserId: string;
  title: string;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  hasUnread: boolean;
};

export type SalesAgentMessageView = SalesAgentMessageRow & {
  senderLabel: string;
};

export function salesAgentDisplayName(
  row: Pick<SalesAgentChatAgentOption, "full_name" | "email" | "user_id">
): string {
  const name = (row.full_name ?? "").trim();
  if (name) return name;
  const email = (row.email ?? "").trim();
  if (email) return email;
  return `${row.user_id.slice(0, 8)}…`;
}
