import { NextResponse, type NextRequest } from "next/server";

import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { assertInternalChatMember } from "@/lib/internal-chat/access";
import { fetchActiveAssignedPatientIdsForStaff } from "@/lib/internal-chat/assigned-patients";
import { decryptInternalChatUtf8 } from "@/lib/internal-chat/crypto";
import { internalChatBodyForDisplay } from "@/lib/internal-chat/mention-tokens";
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

  const allowedPatientIds = await fetchActiveAssignedPatientIdsForStaff(staff.user_id);

  const { data: chats } = await supabaseAdmin
    .from("internal_chats")
    .select("id, chat_type, title, patient_id, team_role")
    .in("id", chatIds);

  const patientRows = (chats ?? []).filter(
    (c) => c.chat_type === "patient" && c.patient_id && allowedPatientIds.has(String(c.patient_id))
  );
  const patientContactTitle = new Map<string, string>();
  if (patientRows.length > 0) {
    const pids = [...new Set(patientRows.map((c) => String(c.patient_id)))];
    const { data: prow } = await supabaseAdmin
      .from("patients")
      .select("id, contacts ( full_name, first_name, last_name )")
      .in("id", pids);
    for (const p of prow ?? []) {
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
      patientContactTitle.set(String(p.id), displayNameFromContact(emb));
    }
  }

  function chatTitle(c: (typeof chats)[number]): string {
    if (c.chat_type === "patient" && c.patient_id) {
      return patientContactTitle.get(String(c.patient_id)) ?? (c.title ?? "Patient");
    }
    if (c.chat_type === "team" && c.team_role) {
      return (c.title ?? "").trim() || `${c.team_role} team`;
    }
    return (c.title ?? "").trim() || "Chat";
  }

  function chatSearchable(c: (typeof chats)[number]): boolean {
    if (c.chat_type === "patient") {
      return Boolean(c.patient_id && allowedPatientIds.has(String(c.patient_id)));
    }
    return true;
  }

  const chatHits =
    chats?.filter((c) => {
      if (!chatSearchable(c)) return false;
      const t = `${chatTitle(c)} ${c.team_role ?? ""}`.toLowerCase();
      return t.includes(q);
    }) ?? [];

  const chatHitIds = new Set(chatHits.map((c) => String(c.id)));

  const messageHits: Array<{ chatId: string; messageId: string; snippet: string }> = [];
  const scanIds = chatIds
    .filter((id) => {
      const c = chats?.find((x) => String(x.id) === id);
      if (!c) return !chatHitIds.has(id);
      if (!chatSearchable(c)) return false;
      return !chatHitIds.has(id);
    })
    .slice(0, 12);

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
      const display = internalChatBodyForDisplay(plain);
      if (display.toLowerCase().includes(q)) {
        const snippet = display.length > 120 ? `${display.slice(0, 117)}…` : display;
        messageHits.push({ chatId: cid, messageId: String(m.id), snippet });
        break;
      }
    }
    if (messageHits.length >= 15) {
      break;
    }
  }

  return NextResponse.json({
    chats: chatHits.map((c) => ({ id: c.id, title: chatTitle(c), chatType: c.chat_type })),
    messages: messageHits,
  });
}
