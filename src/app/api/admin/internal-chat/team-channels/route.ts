import { NextResponse, type NextRequest } from "next/server";

import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import type { StaffRole } from "@/lib/staff-profile";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

const ROLES: StaffRole[] = [
  "super_admin",
  "admin",
  "manager",
  "nurse",
  "don",
  "recruiter",
  "billing",
  "dispatch",
  "credentialing",
  "read_only",
];

function isStaffRole(v: string): v is StaffRole {
  return (ROLES as readonly string[]).includes(v);
}

export async function POST(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { title?: string; teamRole?: string };
  try {
    body = (await req.json()) as { title?: string; teamRole?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const teamRoleRaw = typeof body.teamRole === "string" ? body.teamRole.trim() : "";
  if (!title || !teamRoleRaw || !isStaffRole(teamRoleRaw)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { data: chat, error: cErr } = await supabaseAdmin
    .from("internal_chats")
    .insert({
      chat_type: "team",
      title,
      team_role: teamRoleRaw,
      created_by: staff.user_id,
    })
    .select("id")
    .single();

  if (cErr || !chat?.id) {
    console.warn("[admin/internal-chat/team]", cErr?.message);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  const chatId = String(chat.id);

  const { data: staffRows, error: sErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, role")
    .eq("is_active", true)
    .eq("role", teamRoleRaw);

  if (sErr) {
    console.warn("[admin/internal-chat/team] staff", sErr.message);
    await supabaseAdmin.from("internal_chats").delete().eq("id", chatId);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  function memberForRole(uid: string, role: string): "admin" | "staff" {
    if (uid === staff.user_id) return "admin";
    if (role === "super_admin" || role === "admin") return "admin";
    return "staff";
  }

  const memberRows = (staffRows ?? []).map((r) => ({
    chat_id: chatId,
    user_id: r.user_id as string,
    member_role: memberForRole(r.user_id as string, r.role as string),
  }));

  if (!memberRows.some((m) => m.user_id === staff.user_id)) {
    memberRows.push({ chat_id: chatId, user_id: staff.user_id, member_role: "admin" });
  }

  if (memberRows.length > 0) {
    const { error: mErr } = await supabaseAdmin.from("internal_chat_members").insert(memberRows);
    if (mErr) {
      console.warn("[admin/internal-chat/team] members", mErr.message);
      await supabaseAdmin.from("internal_chats").delete().eq("id", chatId);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
  }

  await insertAuditLog({
    action: "internal_chat_team_channel_created",
    entityType: "internal_chat",
    entityId: chatId,
    metadata: { title, team_role: teamRoleRaw, member_count: memberRows.length },
  });

  return NextResponse.json({ ok: true, chatId });
}
