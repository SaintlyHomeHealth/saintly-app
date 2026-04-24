import { NextResponse, type NextRequest } from "next/server";

import { insertAuditLogTrusted } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { assertInternalChatMember, canPostToInternalChat } from "@/lib/internal-chat/access";
import { decryptInternalChatUtf8, encryptInternalChatUtf8 } from "@/lib/internal-chat/crypto";
import { notifyInternalChatRecipients } from "@/lib/internal-chat/notify-members";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ chatId: string }> };

function bufFromB64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { chatId } = await params;
  const cid = typeof chatId === "string" ? chatId.trim() : "";
  if (!cid) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const member = await assertInternalChatMember(cid, staff.user_id);
  if (!member) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const canPost = member.member_role !== "read_only";

  const { data: messages, error } = await supabaseAdmin
    .from("internal_chat_messages")
    .select(
      "id, chat_id, sender_id, created_at, ciphertext, nonce, attachment_path, attachment_mime, attachment_name, mention_user_ids"
    )
    .eq("chat_id", cid)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.warn("[internal-chat/messages GET]", error.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const senderIds = [...new Set((messages ?? []).map((m) => String(m.sender_id)))];
  const { data: profiles } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .in("user_id", senderIds);

  const senderLabel = new Map(
    (profiles ?? []).map((p) => [
      String(p.user_id),
      (typeof p.full_name === "string" && p.full_name.trim()) ||
        (typeof p.email === "string" && p.email.trim()) ||
        "Staff",
    ])
  );

  const msgIds = (messages ?? []).map((m) => String(m.id));
  const readByMessage = new Map<string, string[]>();
  if (msgIds.length > 0) {
    const { data: reads } = await supabaseAdmin
      .from("internal_chat_message_reads")
      .select("message_id, user_id")
      .in("message_id", msgIds);
    for (const r of reads ?? []) {
      const mid = String(r.message_id);
      const arr = readByMessage.get(mid) ?? [];
      arr.push(String(r.user_id));
      readByMessage.set(mid, arr);
    }
  }

  const out = (messages ?? []).map((m) => {
    let body = "";
    try {
      const ct = typeof m.ciphertext === "string" ? m.ciphertext : "";
      const nn = typeof m.nonce === "string" ? m.nonce : "";
      body = decryptInternalChatUtf8(bufFromB64(ct), bufFromB64(nn));
    } catch {
      body = "";
    }
    return {
      id: m.id,
      senderId: m.sender_id,
      senderLabel: senderLabel.get(String(m.sender_id)) ?? "Staff",
      createdAt: m.created_at,
      body,
      attachmentPath: m.attachment_path,
      attachmentMime: m.attachment_mime,
      attachmentName: m.attachment_name,
      mentionUserIds: m.mention_user_ids ?? [],
      readByUserIds: readByMessage.get(String(m.id)) ?? [],
    };
  });

  await insertAuditLogTrusted({
    action: "internal_chat_thread_viewed",
    entityType: "internal_chat",
    entityId: cid,
    metadata: { message_count: out.length },
  });

  const { data: mem } = await supabaseAdmin
    .from("internal_chat_members")
    .select("notifications_muted, pinned_at")
    .eq("chat_id", cid)
    .eq("user_id", staff.user_id)
    .maybeSingle();

  return NextResponse.json({
    messages: out,
    notificationsMuted: mem?.notifications_muted === true,
    pinned: Boolean(mem?.pinned_at),
    memberRole: member.member_role,
    canPost,
  });
}

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

  if (!(await canPostToInternalChat(cid, staff.user_id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let bodyJson: {
    text?: string;
    mentionUserIds?: string[];
    attachmentPath?: string | null;
    attachmentMime?: string | null;
    attachmentName?: string | null;
  };
  try {
    bodyJson = (await req.json()) as typeof bodyJson;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const text = typeof bodyJson.text === "string" ? bodyJson.text : "";
  const mentionRaw = Array.isArray(bodyJson.mentionUserIds) ? bodyJson.mentionUserIds : [];
  const mentionUserIds = [...new Set(mentionRaw.map((u) => String(u).trim()).filter(Boolean))].slice(0, 25);

  const attachmentPath =
    typeof bodyJson.attachmentPath === "string" && bodyJson.attachmentPath.trim()
      ? bodyJson.attachmentPath.trim()
      : null;
  const attachmentMime =
    typeof bodyJson.attachmentMime === "string" && bodyJson.attachmentMime.trim()
      ? bodyJson.attachmentMime.trim()
      : null;
  const attachmentName =
    typeof bodyJson.attachmentName === "string" && bodyJson.attachmentName.trim()
      ? bodyJson.attachmentName.trim().slice(0, 200)
      : null;

  if (!text.trim() && !attachmentPath) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  if (mentionUserIds.length > 0) {
    const { data: mems } = await supabaseAdmin
      .from("internal_chat_members")
      .select("user_id")
      .eq("chat_id", cid)
      .in("user_id", mentionUserIds);
    const ok = new Set((mems ?? []).map((m) => String(m.user_id)));
    for (const id of mentionUserIds) {
      if (!ok.has(id)) {
        return NextResponse.json({ error: "invalid_mention" }, { status: 400 });
      }
    }
  }

  const plain = text.trim() || (attachmentName ? `📎 ${attachmentName}` : " ");
  const { ciphertext, nonce } = encryptInternalChatUtf8(plain);

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("internal_chat_messages")
    .insert({
      chat_id: cid,
      sender_id: staff.user_id,
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      attachment_path: attachmentPath,
      attachment_mime: attachmentMime,
      attachment_name: attachmentName,
      mention_user_ids: mentionUserIds,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !inserted?.id) {
    console.warn("[internal-chat/messages POST]", insErr?.message);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await insertAuditLogTrusted({
    action: "internal_chat_message_sent",
    entityType: "internal_chat",
    entityId: cid,
    metadata: {
      message_id: inserted.id,
      body_length: plain.length,
      has_attachment: Boolean(attachmentPath),
    },
  });

  void notifyInternalChatRecipients({ chatId: cid, senderUserId: staff.user_id });

  return NextResponse.json({ ok: true, messageId: inserted.id });
}
