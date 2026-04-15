import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canStaffAccessPhoneCallRow } from "@/lib/phone/staff-call-access";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const TYPES = new Set<string>(["soap", "summary", "intake"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { phone_call_id?: string; type?: string; content?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phoneCallId = typeof body.phone_call_id === "string" ? body.phone_call_id.trim() : "";
  if (!phoneCallId || !UUID_RE.test(phoneCallId)) {
    return NextResponse.json({ error: "phone_call_id required" }, { status: 400 });
  }

  const typeRaw = typeof body.type === "string" ? body.type.trim() : "";
  if (!TYPES.has(typeRaw)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, assigned_to_user_id")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (callErr || !callRow?.id) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id:
        typeof callRow.assigned_to_user_id === "string" ? callRow.assigned_to_user_id : null,
    })
  ) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("call_outputs")
    .insert({
      phone_call_id: phoneCallId,
      type: typeRaw,
      content: body.content,
    })
    .select("id, phone_call_id, type, content, created_at, updated_at")
    .single();

  if (insErr || !inserted) {
    console.warn("[save-call-output] insert failed", insErr?.message);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, output: inserted });
}
