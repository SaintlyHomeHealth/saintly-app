import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { assertInternalChatMember } from "@/lib/internal-chat/access";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ chatId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { chatId } = await params;
  const cid = typeof chatId === "string" ? chatId.trim() : "";
  if (!cid) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (!(await assertInternalChatMember(cid, staff.user_id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { muted?: boolean };
  try {
    body = (await req.json()) as { muted?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const muted = body.muted === true;

  const { error } = await supabaseAdmin
    .from("internal_chat_members")
    .update({ notifications_muted: muted })
    .eq("chat_id", cid)
    .eq("user_id", staff.user_id);

  if (error) {
    console.warn("[internal-chat/mute]", error.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, muted });
}
