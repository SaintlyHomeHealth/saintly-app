import "server-only";

import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { supabaseAdmin } from "@/lib/admin";

export async function resolveInternalChatTitleForViewer(
  chatId: string,
  viewerUserId: string
): Promise<{ title: string } | null> {
  const { data: mem } = await supabaseAdmin
    .from("internal_chat_members")
    .select("user_id")
    .eq("chat_id", chatId)
    .eq("user_id", viewerUserId)
    .maybeSingle();

  if (!mem?.user_id) {
    return null;
  }

  const { data: chat } = await supabaseAdmin
    .from("internal_chats")
    .select("id, chat_type, title, patient_id, team_role")
    .eq("id", chatId)
    .maybeSingle();

  if (!chat?.id) {
    return null;
  }

  let title = typeof chat.title === "string" && chat.title.trim() ? chat.title.trim() : "Chat";

  if (chat.chat_type === "patient" && chat.patient_id) {
    const { data: p } = await supabaseAdmin
      .from("patients")
      .select("contacts ( full_name, first_name, last_name )")
      .eq("id", chat.patient_id)
      .maybeSingle();
    const raw = p?.contacts as
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
    title = displayNameFromContact(emb);
  } else if (chat.chat_type === "direct") {
    const { data: dmMembers } = await supabaseAdmin
      .from("internal_chat_members")
      .select("user_id")
      .eq("chat_id", chatId)
      .neq("user_id", viewerUserId)
      .limit(1);
    const peer = dmMembers?.[0]?.user_id as string | undefined;
    if (peer) {
      const { data: sp } = await supabaseAdmin
        .from("staff_profiles")
        .select("full_name, email")
        .eq("user_id", peer)
        .maybeSingle();
      title =
        (typeof sp?.full_name === "string" && sp.full_name.trim()) ||
        (typeof sp?.email === "string" && sp.email.trim()) ||
        "Direct message";
    }
  } else if (chat.chat_type === "team" && chat.team_role) {
    title = title || `${chat.team_role} team`;
  }

  return { title };
}
