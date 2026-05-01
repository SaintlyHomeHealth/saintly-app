import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin/require-admin-api";
import { supabaseAdmin } from "@/lib/admin";

export async function GET() {
  const gate = await requireAdminApiSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("twilio_phone_numbers")
    .select(
      "id, phone_number, twilio_sid, label, number_type, status, assigned_user_id, assigned_staff_profile_id, is_primary_company_number, sms_enabled, voice_enabled, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[api/admin/twilio/phone-numbers] list:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const staffIds = [...new Set((rows ?? []).map((r) => r.assigned_staff_profile_id).filter(Boolean))] as string[];

  const staffById = new Map<string, { full_name: string | null; email: string | null; user_id: string | null }>();
  if (staffIds.length > 0) {
    const { data: profs, error: pErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("id, full_name, email, user_id")
      .in("id", staffIds);
    if (pErr) {
      console.warn("[api/admin/twilio/phone-numbers] staff join:", pErr.message);
    }
    for (const p of profs ?? []) {
      const sid = typeof p.id === "string" ? p.id : "";
      if (!sid) continue;
      staffById.set(sid, {
        full_name: typeof p.full_name === "string" ? p.full_name : null,
        email: typeof p.email === "string" ? p.email : null,
        user_id: typeof p.user_id === "string" ? p.user_id : null,
      });
    }
  }

  const enriched = (rows ?? []).map((r) => {
    const spid =
      r.assigned_staff_profile_id != null && String(r.assigned_staff_profile_id).trim() !== ""
        ? String(r.assigned_staff_profile_id)
        : null;
    const staff = spid ? staffById.get(spid) ?? null : null;
    return { ...r, assignee: staff };
  });

  return NextResponse.json({ numbers: enriched });
}
