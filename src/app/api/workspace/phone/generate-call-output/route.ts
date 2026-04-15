import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { jsonObjectToDisplayText } from "@/lib/phone/generate-call-output-format";
import {
  systemPromptForType,
  userPayloadForGeneration,
  type GenerateCallOutputType,
} from "@/lib/phone/generate-call-output-prompts";
import { fetchOpenAiJsonObject } from "@/lib/phone/phone-call-ai-context";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import { buildTranscriptPlainTextFromPhoneMetadata } from "@/lib/phone/post-call-transcript-text";
import { canStaffAccessPhoneCallRow } from "@/lib/phone/staff-call-access";
import { getStaffProfile, isPhoneWorkspaceUser } from "@/lib/staff-profile";

const TYPES = new Set<string>(["soap", "summary", "intake"]);

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { callSid?: string; type?: string; transcriptText?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callSid = typeof body.callSid === "string" ? body.callSid.trim() : "";
  if (!callSid.startsWith("CA")) {
    return NextResponse.json({ error: "callSid required" }, { status: 400 });
  }

  const typeRaw = typeof body.type === "string" ? body.type.trim() : "";
  if (!TYPES.has(typeRaw)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const type = typeRaw as GenerateCallOutputType;

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, callSid);
  if (!row) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const { data: accessRow } = await supabaseAdmin
    .from("phone_calls")
    .select("assigned_to_user_id")
    .eq("id", row.id)
    .maybeSingle();

  if (
    !accessRow ||
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id:
        typeof accessRow.assigned_to_user_id === "string" ? accessRow.assigned_to_user_id : null,
    })
  ) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  let transcript = buildTranscriptPlainTextFromPhoneMetadata(row.metadata, { callerLabel: "Caller" });
  const fallback = typeof body.transcriptText === "string" ? body.transcriptText.trim() : "";
  if (!transcript && fallback) {
    transcript = fallback.slice(0, 120_000);
  }

  if (!transcript.trim()) {
    return NextResponse.json({ error: "No transcript available for this call" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  const parsed = await fetchOpenAiJsonObject(systemPromptForType(type), userPayloadForGeneration(transcript));
  if (!parsed) {
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }

  const content = jsonObjectToDisplayText(type, parsed);
  return NextResponse.json({
    ok: true,
    type,
    content,
    phone_call_id: row.id,
  });
}
