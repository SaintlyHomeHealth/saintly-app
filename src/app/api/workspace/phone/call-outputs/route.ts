import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import { canStaffAccessPhoneCallRow } from "@/lib/phone/staff-call-access";
import { canAccessWorkspacePhone, getStaffProfile, isPhoneWorkspaceUser } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPES = new Set<string>(["soap", "summary", "intake"]);
const MAX_CONTENT = 500_000;

export type CallOutputRow = {
  id: string;
  phone_call_id: string;
  type: string;
  content: string;
  created_at: string;
  updated_at: string;
};

async function loadCallAssignment(phoneCallId: string): Promise<string | null | undefined> {
  const { data: callRow, error } = await supabaseAdmin
    .from("phone_calls")
    .select("id, assigned_to_user_id")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (error || !callRow?.id) {
    return undefined;
  }

  return typeof callRow.assigned_to_user_id === "string" ? callRow.assigned_to_user_id : null;
}

/**
 * GET saved AI outputs for a call.
 * Query: `callId` (phone_calls.id, preferred for CRM / call detail) or `call_sid` (Twilio CallSid).
 *
 * Read gate matches `/admin/phone/[callId]` (isPhoneWorkspaceUser + call row access), not
 * `canAccessWorkspacePhone` — so managers/admins without `phone_access_enabled` can still
 * view saved outputs on call detail; POST/save remains workspace-gated.
 */
export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const callId = (url.searchParams.get("callId") ?? "").trim();
  const callSid = (url.searchParams.get("call_sid") ?? "").trim();

  let phoneCallId: string;

  if (callId && UUID_RE.test(callId)) {
    const assigned = await loadCallAssignment(callId);
    if (assigned === undefined) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    if (!canStaffAccessPhoneCallRow(staff, { assigned_to_user_id: assigned })) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    phoneCallId = callId;
  } else if (callSid.startsWith("CA")) {
    const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, callSid);
    if (!row) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    const assigned = await loadCallAssignment(row.id);
    if (assigned === undefined) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    if (!canStaffAccessPhoneCallRow(staff, { assigned_to_user_id: assigned })) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }
    phoneCallId = row.id;
  } else {
    return NextResponse.json({ error: "callId or call_sid required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("call_outputs")
    .select("id, phone_call_id, type, content, created_at, updated_at")
    .eq("phone_call_id", phoneCallId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[call-outputs] list_failed", error.message);
    return NextResponse.json({ error: "Could not load saved outputs" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    phone_call_id: phoneCallId,
    outputs: (data ?? []) as CallOutputRow[],
  });
}

/**
 * Upsert one saved output for a call (manual save only; no auto-save).
 */
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
  if (!phoneCallId) {
    return NextResponse.json({ error: "phone_call_id required" }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type.trim() : "";
  if (!TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json({ error: "content too large" }, { status: 400 });
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

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("call_outputs")
    .select("id")
    .eq("phone_call_id", phoneCallId)
    .eq("type", type)
    .maybeSingle();

  if (findErr) {
    console.warn("[call-outputs] find_failed", findErr.message);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  const trimmed = content.trim();
  const sel = "id, phone_call_id, type, content, created_at, updated_at";

  if (existing?.id) {
    const { data: saved, error: upErr } = await supabaseAdmin
      .from("call_outputs")
      .update({ content: trimmed })
      .eq("id", existing.id)
      .select(sel)
      .single();
    if (upErr || !saved) {
      console.warn("[call-outputs] update_failed", upErr?.message);
      return NextResponse.json({ error: "Could not save" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, saved: saved as CallOutputRow });
  }

  const { data: saved, error: inErr } = await supabaseAdmin
    .from("call_outputs")
    .insert({ phone_call_id: phoneCallId, type, content: trimmed })
    .select(sel)
    .single();

  if (inErr || !saved) {
    console.warn("[call-outputs] insert_failed", inErr?.message);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved: saved as CallOutputRow,
  });
}
