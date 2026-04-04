import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { normalizeTwilioRecordingMediaUrl } from "@/lib/phone/twilio-recording-media";
import { canStaffAccessPhoneCallRow } from "@/lib/phone/staff-call-access";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const SID_RE = /^RE[0-9a-f]{32}$/i;

function recordingUrlFromRow(input: { sid: string | null; url: string | null }): string | null {
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (rawUrl) {
    return normalizeTwilioRecordingMediaUrl(rawUrl);
  }
  const sid = typeof input.sid === "string" ? input.sid.trim() : "";
  if (!SID_RE.test(sid)) return null;
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  if (!accountSid) return null;
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Recordings/${encodeURIComponent(sid)}.mp3`;
}

export async function GET(req: NextRequest, props: { params: Promise<{ callId: string }> }) {
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

  const range = req.headers.get("Range");
  const twilioHeaders: Record<string, string> = { Authorization: `Basic ${auth}` };
  if (range) {
    twilioHeaders.Range = range;
  }

  const twilioRes = await fetch(mediaUrl, {
    method: "GET",
    headers: twilioHeaders,
    cache: "no-store",
  });
  if (!twilioRes.ok || !twilioRes.body) {
    console.warn("[voicemail/audio] Twilio fetch failed", {
      status: twilioRes.status,
      callId: id,
    });
    return new NextResponse("Unable to fetch recording", { status: 502 });
  }

  const upstreamCt = twilioRes.headers.get("content-type") ?? "";
  if (upstreamCt.includes("application/json")) {
    console.warn("[voicemail/audio] Twilio returned JSON (recording URL may be metadata, not .mp3)", {
      callId: id,
    });
    return new NextResponse("Recording URL did not return audio", { status: 502 });
  }

  const outHeaders = new Headers();
  outHeaders.set(
    "Content-Type",
    upstreamCt.startsWith("audio/") || upstreamCt === "application/octet-stream" ? upstreamCt : "audio/mpeg"
  );
  outHeaders.set("Cache-Control", "private, no-store, max-age=0");
  const ar = twilioRes.headers.get("Accept-Ranges");
  if (ar) outHeaders.set("Accept-Ranges", ar);
  const cr = twilioRes.headers.get("Content-Range");
  if (cr) outHeaders.set("Content-Range", cr);
  const cl = twilioRes.headers.get("Content-Length");
  if (cl) outHeaders.set("Content-Length", cl);

  return new NextResponse(twilioRes.body, {
    status: twilioRes.status,
    headers: outHeaders,
  });
}
