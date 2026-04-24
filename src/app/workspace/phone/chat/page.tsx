import { redirect } from "next/navigation";

import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { ChatListClient } from "./_components/ChatListClient";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { canAccessWorkspacePhone, getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function WorkspaceChatPage() {
  const staff = await getStaffProfile();
  if (!canAccessWorkspacePhone(staff) || !canAccessWorkspaceInternalChat(staff)) {
    redirect("/admin/phone");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePhonePageHeader
        className="shrink-0"
        title="Chat"
        subtitle="Internal HIPAA-aware messaging for your team. SMS and calls stay in Inbox and Calls."
      />
      <ChatListClient showTeamAdmin={isManagerOrHigher(staff)} />
    </div>
  );
}
