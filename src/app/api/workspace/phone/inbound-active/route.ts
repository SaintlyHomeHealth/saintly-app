import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const ACTIVE_STATUSES = ["initiated", "ringing", "in_progress"] as const;

const LOG_INBOUND_ACTIVE =
  process.env.PHONE_LOG_INBOUND_ACTIVE === "1" || process.env.NODE_ENV === "development";

function logInboundActive(message: string, payload: Record<string, unknown>) {
  if (!LOG_INBOUND_ACTIVE) return;
  console.log(`[workspace/phone/inbound-active] ${message}`, payload);
}

/**
 * True when the call is still a live PSTN/AI session — not post-call voicemail capture or terminal.
 *
 * Rationale (see applyTwilioVoicemailRecording in log-call.ts):
 * - Non-final recording callbacks set `voicemail_recording_sid` / metadata but do NOT set `status` to missed
 *   until `isFinalOk`. The row can stay `in_progress` with `metadata.source = twilio_voice_openai_realtime`,
 *   which incorrectly satisfied the old inbound-active query and resurrected the "AI on the line" banner
 *   after voicemail/recording processing.
 */
function rowLooksLikeLiveAiAssist(row: {
  ended_at?: string | null;
  voicemail_recording_sid?: string | null;
  voicemail_duration_seconds?: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (row.ended_at != null && String(row.ended_at).trim() !== "") {
    return { ok: false, reason: "ended_at_set" };
  }
  const vmSid = typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid.trim() : "";
  if (vmSid !== "") {
    return { ok: false, reason: "voicemail_recording_sid_set" };
  }
  const vmd =
    typeof row.voicemail_duration_seconds === "number" && Number.isFinite(row.voicemail_duration_seconds)
      ? row.voicemail_duration_seconds
      : 0;
  if (vmd > 0) {
    return { ok: false, reason: "voicemail_duration_seconds_positive" };
  }
  return { ok: true };
}

/**
 * Workspace staff: whether an inbound OpenAI-realtime call is currently live (AI on the line).
 * Used to drive the call dock / banner when Twilio Client is not ringing (stream-only inbound).
 */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 50 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("phone_calls")
    .select(
      "from_e164, external_call_id, status, started_at, ended_at, voicemail_recording_sid, voicemail_duration_seconds, metadata"
    )
    .eq("direction", "inbound")
    .in("status", [...ACTIVE_STATUSES])
    .gte("started_at", since)
    .contains("metadata", { source: "twilio_voice_openai_realtime" })
    .is("ended_at", null)
    .or("voicemail_recording_sid.is.null,voicemail_recording_sid.eq.")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logInboundActive("query_error", { message: error.message });
    if (process.env.NODE_ENV === "development") {
      console.warn("[workspace/phone/inbound-active]", error.message);
    }
    return NextResponse.json({ active: false }, { status: 200 });
  }

  if (!data?.external_call_id) {
    logInboundActive("no_row", { since });
    return NextResponse.json({ active: false });
  }

  const meta = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? (data.metadata as Record<string, unknown>)
    : {};
  const twilioLast = meta.twilio_last_voicemail;
  const hasVmMeta = twilioLast != null && typeof twilioLast === "object";

  const gate = rowLooksLikeLiveAiAssist({
    ended_at: data.ended_at,
    voicemail_recording_sid: data.voicemail_recording_sid,
    voicemail_duration_seconds: data.voicemail_duration_seconds,
  });

  if (!gate.ok) {
    logInboundActive("excluded_post_call_signals", {
      external_call_id: data.external_call_id,
      status: data.status,
      gate_reason: gate.reason,
      has_metadata_twilio_last_voicemail: hasVmMeta,
    });
    return NextResponse.json({ active: false });
  }

  /** Extra guard: recording callback always sets `twilio_last_voicemail` with `voicemail_recording_sid`; covers empty-string column edge cases. */
  if (hasVmMeta) {
    logInboundActive("excluded_twilio_last_voicemail_metadata", {
      external_call_id: data.external_call_id,
      status: data.status,
    });
    return NextResponse.json({ active: false });
  }

  logInboundActive("active_true", {
    reason: "inbound_openai_realtime_row_live",
    external_call_id: data.external_call_id,
    status: data.status,
    started_at: data.started_at,
    ended_at: data.ended_at ?? null,
    voicemail_recording_sid: data.voicemail_recording_sid ?? null,
    voicemail_duration_seconds: data.voicemail_duration_seconds ?? null,
    metadata_source: meta.source,
    has_twilio_last_callback: meta.twilio_last_callback != null,
    parent_call_sid_from_meta:
      typeof meta.twilio_amd_last_callback === "object" &&
      meta.twilio_amd_last_callback !== null &&
      typeof (meta.twilio_amd_last_callback as Record<string, unknown>).child_call_sid === "string"
        ? (meta.twilio_amd_last_callback as Record<string, unknown>).child_call_sid
        : null,
  });

  return NextResponse.json({
    active: true,
    from_e164: data.from_e164 ?? null,
    external_call_id: data.external_call_id,
    status: data.status,
  });
}
