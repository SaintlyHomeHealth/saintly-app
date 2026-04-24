import { NextResponse, type NextRequest } from "next/server";

import { decryptInternalChatUtf8 } from "@/lib/internal-chat/crypto";
import { assertInternalChatMember } from "@/lib/internal-chat/access";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) {
    return NextResponse.json({ chats: [], messages: [] });
  }

  const { data: memberRows } = await supabaseAdmin
    .from("internal_chat_members")
    .select("chat_id")
    .eq("user_id", staff.user_id);

  const chatIds = (memberRows ?? []).map((r) => String(r.chat_id)).filter(Boolean);
  if (chatIds.length === 0) {
    return NextResponse.json({ chats: [], messages: [] });
  }

  const { data: chats } = await supabaseAdmin
    .from("internal_chats")
    .select("id, chat_type, title, patient_id, team_role")
    .in("id", chatIds);

  const chatHits =
    chats?.filter((c) => {
      const t = `${c.title ?? ""} ${c.team_role ?? ""}`.toLowerCase();
      return t.includes(q);
    }) ?? [];

  const chatHitIds = new Set(chatHits.map((c) => String(c.id)));

  const messageHits: Array<{ chatId: string; messageId: string; snippet: string }> = [];
  const scanIds = chatIds.filter((id) => !chatHitIds.has(id)).slice(0, 12);

  for (const cid of scanIds) {
    if (!(await assertInternalChatMember(cid, staff.user_id))) {
      continue;
    }
    const { data: msgs } = await supabaseAdmin
      .from("internal_chat_messages")
      .select("id, ciphertext, nonce")
      .eq("chat_id", cid)
      .order("created_at", { ascending: false })
      .limit(40);

    for (const m of msgs ?? []) {
      let plain = "";
      try {
        const ct = typeof m.ciphertext === "string" ? m.ciphertext : "";
        const nn = typeof m.nonce === "string" ? m.nonce : "";
        plain = decryptInternalChatUtf8(Buffer.from(ct, "base64"), Buffer.from(nn, "base64"));
      } catch {
        continue;
      }
      if (plain.toLowerCase().includes(q)) {
        const snippet = plain.length > 120 ? `${plain.slice(0, 117)}…` : plain;
        messageHits.push({ chatId: cid, messageId: String(m.id), snippet });
        break;
      }
    }
    if (messageHits.length >= 15) {
      break;
    }
  }

  return NextResponse.json({
    chats: chatHits.map((c) => ({ id: c.id, title: c.title, chatType: c.chat_type })),
    messages: messageHits,
  });
}
