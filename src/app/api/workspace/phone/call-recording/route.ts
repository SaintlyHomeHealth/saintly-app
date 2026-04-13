import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneRecordingMetadata } from "@/lib/phone/merge-softphone-recording-metadata";
import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";
import {
  defaultSoftphoneRecordingMeta,
  type SoftphoneRecordingMeta,
} from "@/lib/twilio/softphone-recording-types";
import {
  fetchConferenceRecordingStatus,
  fetchRecordingStatus,
  startCallLegRecording,
  startConferenceRecordingRest,
  stopCallLegRecording,
  stopConferenceRecordingRest,
} from "@/lib/twilio/softphone-recording-twilio";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

function asMeta(v: unknown): SoftphoneRecordingMeta {
  if (!v || typeof v !== "object" || Array.isArray(v)) return defaultSoftphoneRecordingMeta();
  const o = v as Record<string, unknown>;
  const status =
    o.status === "in-progress" || o.status === "stopped" || o.status === "failed" || o.status === "idle"
      ? o.status
      : "idle";
  const source =
    o.source === "conference" || o.source === "pstn_leg" || o.source === "client_leg" ? o.source : null;
  return {
    recording_sid: typeof o.recording_sid === "string" ? o.recording_sid : null,
    source,
    status,
    started_at: typeof o.started_at === "string" ? o.started_at : null,
    stopped_at: typeof o.stopped_at === "string" ? o.stopped_at : null,
    last_error_message: typeof o.last_error_message === "string" ? o.last_error_message : null,
  };
}

/**
 * Manual call recording for workspace softphone (start / stop / state).
 * Persists to `phone_calls.metadata.softphone_recording`.
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string; callSid?: string };
  try {
    body = (await req.json()) as { action?: string; callSid?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const callSid = typeof body.callSid === "string" ? body.callSid.trim() : "";
  if (!callSid.startsWith("CA")) {
    return NextResponse.json({ error: "callSid required (Client leg CallSid)" }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
  }

  const { data: row, error: findErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, metadata")
    .eq("external_call_id", callSid)
    .maybeSingle();

  if (findErr || !row?.metadata || typeof row.metadata !== "object") {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const metaRow = row.metadata as Record<string, unknown>;
  const sc = metaRow.softphone_conference as SoftphoneConferenceMeta | undefined;
  const conferenceSid = sc?.conference_sid?.trim() ?? null;
  const pstnCallSid = sc?.pstn_call_sid?.trim() ?? null;
  const prevRec = asMeta(metaRow.softphone_recording);

  if (action === "state") {
    const rec = prevRec;
    if (rec.status === "in-progress" && rec.recording_sid && rec.source) {
      if (rec.source === "conference" && conferenceSid) {
        const st = await fetchConferenceRecordingStatus({
          accountSid,
          authToken,
          conferenceSid,
          recordingSid: rec.recording_sid,
        });
        if (!("error" in st)) {
          return NextResponse.json({
            ok: true,
            recording: rec,
            twilio: { status: st.status, duration: st.duration },
          });
        }
      }
      if ((rec.source === "pstn_leg" || rec.source === "client_leg") && pstnCallSid) {
        const legSid = rec.source === "pstn_leg" ? pstnCallSid : callSid;
        const st = await fetchRecordingStatus({
          accountSid,
          authToken,
          callSid: legSid,
          recordingSid: rec.recording_sid,
        });
        if (!("error" in st)) {
          return NextResponse.json({
            ok: true,
            recording: rec,
            twilio: { status: st.status, duration: st.duration },
          });
        }
      }
    }
    return NextResponse.json({ ok: true, recording: rec });
  }

  if (action === "start") {
    if (prevRec.status === "in-progress" && prevRec.recording_sid) {
      return NextResponse.json({ ok: true, recording: prevRec, already: true });
    }

    if (conferenceSid) {
      let started = await startConferenceRecordingRest({ accountSid, authToken, conferenceSid });
      if ("error" in started) {
        const params = new URLSearchParams();
        params.set("RecordingChannels", "mono");
        const path = `/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Conferences/${encodeURIComponent(conferenceSid)}/Recordings.json`;
        const res = await fetch(`https://api.twilio.com${path}`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });
        const text = await res.text();
        let json: { sid?: string; message?: string } | null = null;
        try {
          json = text ? (JSON.parse(text) as { sid?: string; message?: string }) : null;
        } catch {
          json = null;
        }
        if (res.ok && json?.sid?.startsWith("RE")) {
          started = { recordingSid: json.sid };
        } else {
          started = { error: json?.message ?? text.slice(0, 200) };
        }
      }
      if (!("error" in started)) {
        const next: SoftphoneRecordingMeta = {
          recording_sid: started.recordingSid,
          source: "conference",
          status: "in-progress",
          started_at: new Date().toISOString(),
          stopped_at: null,
          last_error_message: null,
        };
        const merged = await mergeSoftphoneRecordingMetadata(supabaseAdmin, callSid, next);
        if (!merged.ok) {
          return NextResponse.json({ error: merged.error }, { status: 500 });
        }
        return NextResponse.json({ ok: true, recording: next });
      }
    }

    const legTarget = pstnCallSid ?? callSid;
    const legSource = pstnCallSid ? ("pstn_leg" as const) : ("client_leg" as const);
    const leg = await startCallLegRecording({ accountSid, authToken, callSid: legTarget });
    if ("error" in leg) {
      const errPatch: Partial<SoftphoneRecordingMeta> = {
        status: "failed",
        last_error_message: leg.error,
      };
      await mergeSoftphoneRecordingMetadata(supabaseAdmin, callSid, errPatch);
      return NextResponse.json(
        { ok: false, error: "Recording could not be started.", detail: leg.error },
        { status: 502 }
      );
    }

    const next: SoftphoneRecordingMeta = {
      recording_sid: leg.recordingSid,
      source: legSource,
      status: "in-progress",
      started_at: new Date().toISOString(),
      stopped_at: null,
      last_error_message: null,
    };
    const merged = await mergeSoftphoneRecordingMetadata(supabaseAdmin, callSid, next);
    if (!merged.ok) {
      return NextResponse.json({ error: merged.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, recording: next });
  }

  if (action === "stop") {
    if (prevRec.status !== "in-progress" || !prevRec.recording_sid) {
      return NextResponse.json({ ok: true, recording: prevRec, already: true });
    }

    if (prevRec.source === "conference" && conferenceSid) {
      const stopped = await stopConferenceRecordingRest({
        accountSid,
        authToken,
        conferenceSid,
        recordingSid: prevRec.recording_sid,
      });
      if ("error" in stopped) {
        const cur = await stopConferenceRecordingRest({
          accountSid,
          authToken,
          conferenceSid,
          recordingSid: "CURRENT",
        });
        if ("error" in cur) {
          await mergeSoftphoneRecordingMetadata(supabaseAdmin, callSid, {
            status: "failed",
            last_error_message: stopped.error,
          });
          return NextResponse.json(
            { ok: false, error: "Could not stop recording.", detail: stopped.error },
            { status: 502 }
          );
        }
      }
    } else {
      const legSid = prevRec.source === "pstn_leg" && pstnCallSid ? pstnCallSid : callSid;
      const stopped = await stopCallLegRecording({
        accountSid,
        authToken,
        callSid: legSid,
        recordingSid: prevRec.recording_sid,
      });
      if ("error" in stopped) {
        const cur = await stopCallLegRecording({
          accountSid,
          authToken,
          callSid: legSid,
          recordingSid: "CURRENT",
        });
        if ("error" in cur) {
          await mergeSoftphoneRecordingMetadata(supabaseAdmin, callSid, {
            status: "failed",
            last_error_message: stopped.error,
          });
          return NextResponse.json(
            { ok: false, error: "Could not stop recording.", detail: stopped.error },
            { status: 502 }
          );
        }
      }
    }

    const next: SoftphoneRecordingMeta = {
      ...prevRec,
      status: "stopped",
      stopped_at: new Date().toISOString(),
      last_error_message: null,
    };
    const merged = await mergeSoftphoneRecordingMetadata(supabaseAdmin, callSid, next);
    if (!merged.ok) {
      return NextResponse.json({ error: merged.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, recording: next });
  }

  return NextResponse.json({ error: "action must be start, stop, or state" }, { status: 400 });
}
