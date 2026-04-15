import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

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

/**
 * GET saved AI outputs for a call.
 * Query: `call_sid` (Twilio CallSid on the Client leg or resolvable leg).
 */
export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const callSid = (url.searchParams.get("call_sid") ?? "").trim();
  if (!callSid.startsWith("CA")) {
    return NextResponse.json({ error: "call_sid required" }, { status: 400 });
  }

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, callSid);
  if (!row) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("call_outputs")
    .select("id, phone_call_id, type, content, created_at, updated_at")
    .eq("phone_call_id", row.id)
    .order("type", { ascending: true });

  if (error) {
    console.warn("[call-outputs] list_failed", error.message);
    return NextResponse.json({ error: "Could not load saved outputs" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    phone_call_id: row.id,
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
    .select("id")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (callErr || !callRow?.id) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const { data: saved, error: upErr } = await supabaseAdmin
    .from("call_outputs")
    .upsert(
      {
        phone_call_id: phoneCallId,
        type,
        content: content.trim(),
      },
      { onConflict: "phone_call_id,type" }
    )
    .select("id, phone_call_id, type, content, created_at, updated_at")
    .single();

  if (upErr || !saved) {
    console.warn("[call-outputs] upsert_failed", upErr?.message);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved: saved as CallOutputRow,
  });
}
