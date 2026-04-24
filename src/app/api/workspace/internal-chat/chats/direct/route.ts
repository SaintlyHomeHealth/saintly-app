import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import type { StaffProfile } from "@/lib/staff-profile";
import { getStaffProfile, isPhoneWorkspaceUser } from "@/lib/staff-profile";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { otherUserId?: string };
  try {
    body = (await req.json()) as { otherUserId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const other = typeof body.otherUserId === "string" ? body.otherUserId.trim() : "";
  if (!other || other === staff.user_id) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { data: opFull } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, role, is_active")
    .eq("user_id", other)
    .maybeSingle();

  if (
    !opFull?.user_id ||
    opFull.is_active !== true ||
    !isPhoneWorkspaceUser({ role: opFull.role, is_active: true } as StaffProfile)
  ) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const a = staff.user_id < other ? staff.user_id : other;
  const b = staff.user_id < other ? other : staff.user_id;

  const { data: existing } = await supabaseAdmin
    .from("internal_chat_direct_index")
    .select("chat_id")
    .eq("user_low", a)
    .eq("user_high", b)
    .maybeSingle();

  if (existing?.chat_id) {
    return NextResponse.json({ ok: true, chatId: existing.chat_id });
  }

  const { data: chat, error: cErr } = await supabaseAdmin
    .from("internal_chats")
    .insert({
      chat_type: "direct",
      title: "Direct message",
      created_by: staff.user_id,
    })
    .select("id")
    .single();

  if (cErr || !chat?.id) {
    console.warn("[internal-chat/direct] chat", cErr?.message);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  const chatId = String(chat.id);

  const { error: mErr } = await supabaseAdmin.from("internal_chat_members").insert([
    { chat_id: chatId, user_id: staff.user_id, member_role: "staff" },
    { chat_id: chatId, user_id: other, member_role: "staff" },
  ]);

  if (mErr) {
    console.warn("[internal-chat/direct] members", mErr.message);
    await supabaseAdmin.from("internal_chats").delete().eq("id", chatId);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  const { error: iErr } = await supabaseAdmin.from("internal_chat_direct_index").insert({
    user_low: a,
    user_high: b,
    chat_id: chatId,
  });

  if (iErr) {
    console.warn("[internal-chat/direct] index", iErr.message);
    await supabaseAdmin.from("internal_chats").delete().eq("id", chatId);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, chatId });
}
