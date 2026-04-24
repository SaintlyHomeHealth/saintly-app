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

  let body: { upToMessageId?: string };
  try {
    body = (await req.json()) as { upToMessageId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const mid = typeof body.upToMessageId === "string" ? body.upToMessageId.trim() : "";
  if (!mid) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { data: msg, error: mErr } = await supabaseAdmin
    .from("internal_chat_messages")
    .select("id, chat_id, created_at")
    .eq("id", mid)
    .eq("chat_id", cid)
    .maybeSingle();

  if (mErr || !msg?.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error: rErr } = await supabaseAdmin.from("internal_chat_message_reads").upsert(
    {
      message_id: mid,
      user_id: staff.user_id,
      read_at: new Date().toISOString(),
    },
    { onConflict: "message_id,user_id" }
  );

  if (rErr) {
    console.warn("[internal-chat/read]", rErr.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  const { error: uErr } = await supabaseAdmin
    .from("internal_chat_members")
    .update({ last_read_at: msg.created_at as string })
    .eq("chat_id", cid)
    .eq("user_id", staff.user_id);

  if (uErr) {
    console.warn("[internal-chat/read] member:", uErr.message);
  }

  return NextResponse.json({ ok: true });
}
