import { NextResponse, type NextRequest } from "next/server";

import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ chatId: string }> };

const MEMBER_ROLES = new Set(["admin", "staff", "read_only"]);

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { chatId } = await params;
  const cid = typeof chatId === "string" ? chatId.trim() : "";
  if (!cid) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("internal_chat_members")
    .select("user_id, member_role, pinned_at, notifications_muted")
    .eq("chat_id", cid);

  if (error) {
    console.warn("[admin/internal-chat/members GET]", error.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const uids = (rows ?? []).map((r) => String(r.user_id)).filter(Boolean);
  const { data: profiles } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email, role, is_active")
    .in("user_id", uids);

  const label = new Map(
    (profiles ?? []).map((p) => [
      String(p.user_id),
      {
        label:
          (typeof p.full_name === "string" && p.full_name.trim()) ||
          (typeof p.email === "string" && p.email.trim()) ||
          "Staff",
        email: p.email ?? null,
        role: p.role ?? null,
        isActive: p.is_active === true,
      },
    ])
  );

  const members = (rows ?? []).map((r) => {
    const uid = String(r.user_id);
    const meta = label.get(uid);
    return {
      userId: uid,
      memberRole: r.member_role as string,
      label: meta?.label ?? "Staff",
      email: meta?.email ?? null,
      staffRole: meta?.role ?? null,
      isActive: meta?.isActive ?? false,
    };
  });

  members.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  return NextResponse.json({ members });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { chatId } = await params;
  const cid = typeof chatId === "string" ? chatId.trim() : "";
  if (!cid) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  let body: { userId?: string; memberRole?: string };
  try {
    body = (await req.json()) as { userId?: string; memberRole?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const memberRole = typeof body.memberRole === "string" ? body.memberRole.trim() : "staff";
  if (!userId || !MEMBER_ROLES.has(memberRole)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { data: target } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (!target?.user_id || target.is_active !== true) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from("internal_chat_members").upsert(
    {
      chat_id: cid,
      user_id: userId,
      member_role: memberRole,
    },
    { onConflict: "chat_id,user_id" }
  );

  if (error) {
    console.warn("[admin/internal-chat/members POST]", error.message);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  await insertAuditLog({
    action: "internal_chat_member_added",
    entityType: "internal_chat",
    entityId: cid,
    metadata: { added_user_id: userId, member_role: memberRole },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { chatId } = await params;
  const cid = typeof chatId === "string" ? chatId.trim() : "";
  const userId = (req.nextUrl.searchParams.get("userId") ?? "").trim();
  if (!cid || !userId) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (userId === staff.user_id) {
    return NextResponse.json({ error: "cannot_remove_self" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("internal_chat_members")
    .delete()
    .eq("chat_id", cid)
    .eq("user_id", userId);

  if (error) {
    console.warn("[admin/internal-chat/members DELETE]", error.message);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  await insertAuditLog({
    action: "internal_chat_member_removed",
    entityType: "internal_chat",
    entityId: cid,
    metadata: { removed_user_id: userId },
  });

  return NextResponse.json({ ok: true });
}
