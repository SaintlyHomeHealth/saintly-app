import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canStaffAccessPhoneCallRow } from "@/lib/phone/staff-call-access";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const SID_RE = /^RE[0-9a-f]{32}$/i;

function recordingUrlFromRow(input: { sid: string | null; url: string | null }): string | null {
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (rawUrl) {
    return rawUrl.endsWith(".mp3") ? rawUrl : `${rawUrl}.mp3`;
  }
  const sid = typeof input.sid === "string" ? input.sid.trim() : "";
  if (!SID_RE.test(sid)) return null;
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!accountSid) return null;
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Recordings/${encodeURIComponent(sid)}.mp3`;
}

export async function GET(_req: NextRequest, props: { params: Promise<{ callId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { callId } = await props.params;
  const id = typeof callId === "string" ? callId.trim() : "";
  if (!id) {
    return new NextResponse("Missing call id", { status: 400 });
  }

  const { data: row, error } = await supabaseAdmin
    .from("phone_calls")
    .select("id, assigned_to_user_id, voicemail_recording_sid, voicemail_recording_url")
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.id) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id: typeof row.assigned_to_user_id === "string" ? row.assigned_to_user_id : null,
    })
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const mediaUrl = recordingUrlFromRow({
    sid: typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid : null,
    url: typeof row.voicemail_recording_url === "string" ? row.voicemail_recording_url : null,
  });
  if (!mediaUrl) {
    return new NextResponse("Voicemail recording unavailable", { status: 404 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return new NextResponse("Voicemail audio not configured", { status: 503 });
  }
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const twilioRes = await fetch(mediaUrl, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!twilioRes.ok || !twilioRes.body) {
    return new NextResponse("Unable to fetch recording", { status: 502 });
  }

  return new NextResponse(twilioRes.body, {
    status: 200,
    headers: {
      "Content-Type": twilioRes.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
