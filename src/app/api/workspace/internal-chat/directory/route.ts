import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import type { StaffProfile } from "@/lib/staff-profile";
import { getStaffProfile, isPhoneWorkspaceUser } from "@/lib/staff-profile";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ users: [] });
  }

  const qLower = q.toLowerCase();
  const { data: rows, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email, role, is_active")
    .eq("is_active", true)
    .neq("user_id", staff.user_id)
    .limit(120);

  if (error) {
    console.warn("[internal-chat/directory]", error.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const users = (rows ?? [])
    .filter((r) => isPhoneWorkspaceUser({ role: r.role, is_active: true } as StaffProfile))
    .map((r) => {
      const label =
        (typeof r.full_name === "string" && r.full_name.trim()) ||
        (typeof r.email === "string" && r.email.trim()) ||
        "Staff";
      return {
        userId: r.user_id as string,
        label,
        email: r.email ?? null,
        role: r.role as string,
      };
    })
    .filter(
      (u) =>
        u.label.toLowerCase().includes(qLower) || (u.email && u.email.toLowerCase().includes(qLower))
    )
    .slice(0, 15);

  return NextResponse.json({ users });
}
