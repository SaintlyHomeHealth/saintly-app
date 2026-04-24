import { NextResponse } from "next/server";

import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { getWorkspaceInternalChatListForStaff } from "@/lib/internal-chat/workspace-chat-list";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const chats = await getWorkspaceInternalChatListForStaff(staff);
  return NextResponse.json({ chats });
}
