import { redirect } from "next/navigation";

import { ChatThreadClient } from "../_components/ChatThreadClient";
import { resolveInternalChatTitleForViewer } from "@/lib/internal-chat/resolve-chat-title";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { canAccessWorkspacePhone, getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function WorkspaceChatThreadPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const staff = await getStaffProfile();
  if (!canAccessWorkspacePhone(staff) || !canAccessWorkspaceInternalChat(staff)) {
    redirect("/admin/phone");
  }

  const { chatId } = await params;
  const id = typeof chatId === "string" ? chatId.trim() : "";
  if (!id) {
    redirect("/workspace/phone/chat");
  }

  const resolved = await resolveInternalChatTitleForViewer(id, staff.user_id);
  if (!resolved) {
    redirect("/workspace/phone/chat");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <ChatThreadClient
      chatId={id}
      chatType={resolved.chatType}
      title={resolved.title}
      showMemberAdmin={isManagerOrHigher(staff)}
      selfUserId={staff.user_id}
    />
    </div>
  );
}
