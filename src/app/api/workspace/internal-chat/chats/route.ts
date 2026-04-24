import { NextResponse } from "next/server";

import { fetchActiveAssignedPatientIdsForStaff } from "@/lib/internal-chat/assigned-patients";
import { decryptInternalChatUtf8 } from "@/lib/internal-chat/crypto";
import { internalChatBodyForDisplay } from "@/lib/internal-chat/mention-tokens";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { supabaseAdmin } from "@/lib/admin";
import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

type ChatRow = {
  id: string;
  chat_type: string;
  title: string;
  patient_id: string | null;
  team_role: string | null;
  last_message_at: string | null;
};

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: memberRows, error: memErr } = await supabaseAdmin
    .from("internal_chat_members")
    .select("chat_id, pinned_at, notifications_muted, last_read_at")
    .eq("user_id", staff.user_id);

  if (memErr) {
    console.warn("[internal-chat/chats] members:", memErr.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const chatIds = (memberRows ?? []).map((r) => r.chat_id as string).filter(Boolean);
  if (chatIds.length === 0) {
    return NextResponse.json({ chats: [] });
  }

  const { data: chats, error: cErr } = await supabaseAdmin
    .from("internal_chats")
    .select("id, chat_type, title, patient_id, team_role, last_message_at")
    .in("id", chatIds);

  if (cErr || !chats) {
    console.warn("[internal-chat/chats] chats:", cErr?.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const chatMap = new Map(chats.map((c) => [c.id as string, c as ChatRow]));
  const allowedPatientIds = await fetchActiveAssignedPatientIdsForStaff(staff.user_id);
  const patientIds = chats
    .filter((c) => c.chat_type === "patient" && c.patient_id && allowedPatientIds.has(String(c.patient_id)))
    .map((c) => c.patient_id)
    .filter(Boolean) as string[];

  const contactByPatient = new Map<string, string>();
  if (patientIds.length > 0) {
    const { data: patients } = await supabaseAdmin
      .from("patients")
      .select("id, contacts ( full_name, first_name, last_name )")
      .in("id", patientIds);
    for (const p of patients ?? []) {
      const raw = p.contacts as
        | {
            full_name?: string | null;
            first_name?: string | null;
            last_name?: string | null;
          }
        | Array<{
            full_name?: string | null;
            first_name?: string | null;
            last_name?: string | null;
          }>
        | null
        | undefined;
      const emb = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
      contactByPatient.set(String(p.id), displayNameFromContact(emb));
    }
  }

  const { data: msgRows } = await supabaseAdmin
    .from("internal_chat_messages")
    .select("id, chat_id, created_at, ciphertext, nonce, attachment_name")
    .in("chat_id", chatIds)
    .order("created_at", { ascending: false })
    .limit(400);

  const lastMsgByChat = new Map<string, (typeof msgRows)[number]>();
  for (const m of msgRows ?? []) {
    const cid = String(m.chat_id);
    if (!lastMsgByChat.has(cid)) {
      lastMsgByChat.set(cid, m);
    }
  }

  const directChatIds = chats.filter((c) => c.chat_type === "direct").map((c) => String(c.id));
  const dmPeerName = new Map<string, string>();
  if (directChatIds.length > 0) {
    const { data: dmMembers } = await supabaseAdmin
      .from("internal_chat_members")
      .select("chat_id, user_id")
      .in("chat_id", directChatIds)
      .neq("user_id", staff.user_id);

    const peerIds = [...new Set((dmMembers ?? []).map((r) => String(r.user_id)))];
    if (peerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("staff_profiles")
        .select("user_id, full_name, email")
        .in("user_id", peerIds);
      const label = new Map(
        (profiles ?? []).map((p) => [
          String(p.user_id),
          (typeof p.full_name === "string" && p.full_name.trim()) ||
            (typeof p.email === "string" && p.email.trim()) ||
            "Teammate",
        ])
      );
      for (const row of dmMembers ?? []) {
        dmPeerName.set(String(row.chat_id), label.get(String(row.user_id)) ?? "Direct message");
      }
    }
  }

  const memberMeta = new Map((memberRows ?? []).map((r) => [r.chat_id as string, r]));

  const out = chatIds
    .map((id) => {
      const chat = chatMap.get(id);
      if (!chat) return null;
      const meta = memberMeta.get(id);
      const last = lastMsgByChat.get(id);
      let preview = "";
      if (last) {
        try {
          const ct = typeof last.ciphertext === "string" ? last.ciphertext : "";
          const nn = typeof last.nonce === "string" ? last.nonce : "";
          const raw = decryptInternalChatUtf8(Buffer.from(ct, "base64"), Buffer.from(nn, "base64"));
          preview = internalChatBodyForDisplay(raw);
        } catch {
          preview = "";
        }
        if (!preview && last.attachment_name) {
          preview = `📎 ${last.attachment_name}`;
        }
      }

      let title = chat.title || "Chat";
      if (chat.chat_type === "patient") {
        if (!chat.patient_id || !allowedPatientIds.has(String(chat.patient_id))) {
          return null;
        }
        const pn = chat.patient_id ? contactByPatient.get(chat.patient_id) : null;
        if (pn) {
          title = pn;
        }
      } else if (chat.chat_type === "direct") {
        title = dmPeerName.get(id) ?? "Direct message";
      } else if (chat.chat_type === "team" && chat.team_role) {
        title = chat.title?.trim() || `${chat.team_role} team`;
      }

      const lastAt = chat.last_message_at;
      const lastRead = meta?.last_read_at as string | null | undefined;
      const hasUnread = Boolean(lastAt && (!lastRead || lastAt > lastRead));

      return {
        id: chat.id,
        chatType: chat.chat_type,
        title,
        pinnedAt: meta?.pinned_at ?? null,
        notificationsMuted: meta?.notifications_muted === true,
        lastMessageAt: lastAt,
        lastMessagePreview: preview.length > 160 ? `${preview.slice(0, 157)}…` : preview,
        hasUnread,
        patientId: chat.patient_id,
        teamRole: chat.team_role,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ chats: out });
}
