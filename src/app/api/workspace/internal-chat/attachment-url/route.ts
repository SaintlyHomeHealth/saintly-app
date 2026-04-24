import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { assertInternalChatMember } from "@/lib/internal-chat/access";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

/**
 * Signed URL for internal-chat bucket objects. Path must start with `{chatId}/`.
 */
export async function GET(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const path = (req.nextUrl.searchParams.get("path") ?? "").trim();
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const chatId = path.split("/")[0] ?? "";
  if (!chatId || !(await assertInternalChatMember(chatId, staff.user_id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.storage.from("internal-chat").createSignedUrl(path, 120);

  if (error || !data?.signedUrl) {
    console.warn("[internal-chat/attachment-url]", error?.message);
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
