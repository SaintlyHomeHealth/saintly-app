import { redirect } from "next/navigation";

import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { ChatListClient } from "./_components/ChatListClient";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { getWorkspaceInternalChatListForStaff } from "@/lib/internal-chat/workspace-chat-list";
import { canUseWorkspacePhoneAppShell, getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function WorkspaceChatPage() {
  const staff = await getStaffProfile();
  if (!staff) {
    redirect("/admin/phone");
  }
  if (!canUseWorkspacePhoneAppShell(staff) || !canAccessWorkspaceInternalChat(staff)) {
    redirect("/admin/phone");
  }

  const initialChats = await getWorkspaceInternalChatListForStaff(staff);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePhonePageHeader
        className="shrink-0"
        title="Chat"
        subtitle="Internal HIPAA-aware messaging for your team. SMS and calls stay in Inbox and Calls."
      />
      <ChatListClient showTeamAdmin={isManagerOrHigher(staff)} initialChats={initialChats} />
    </div>
  );
}
