import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { staffCanAccessPhoneCallId } from "@/lib/phone/staff-call-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import { canAccessWorkspacePhone, resolveStaffProfileForWorkspacePhoneApi } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

const MAX_BROWSER_REPORTS = 8;

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/**
 * Accepts a end-of-call diagnostics payload from Twilio Voice.js in the staff workspace browser.
 * Merges into `phone_calls.metadata.call_quality.client_browser_reports` and appends `phone_call_events`.
 */
export async function POST(req: NextRequest) {
  const staff = await resolveStaffProfileForWorkspacePhoneApi(req);
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const twilioCallSid =
    typeof body.twilio_call_sid === "string" ? body.twilio_call_sid.trim() : "";
  if (!twilioCallSid.startsWith("CA")) {
    return NextResponse.json({ ok: false, error: "twilio_call_sid required" }, { status: 400 });
  }

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, twilioCallSid);
  if (!row?.id) {
    return NextResponse.json({ ok: false, error: "Call not found" }, { status: 404 });
  }

  const userSupabase = await createServerSupabaseClient();
  if (!(await staffCanAccessPhoneCallId(userSupabase, staff, supabaseAdmin, row.id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const reporter =
    typeof body.staff_user_id === "string" ? body.staff_user_id.trim() : "";
  if (!reporter || reporter !== staff.user_id) {
    return NextResponse.json({ ok: false, error: "staff_user_id mismatch" }, { status: 403 });
  }

  const receivedAt = new Date().toISOString();
  const report = {
    ...body,
    received_at: receivedAt,
    phone_call_id: row.id,
    external_call_id: row.external_call_id,
  };

  const prevMeta = asRecord(row.metadata);
  const prevCq = asRecord(prevMeta.call_quality);
  const prevReports = Array.isArray(prevCq.client_browser_reports)
    ? [...(prevCq.client_browser_reports as unknown[])]
    : [];
  prevReports.push(report);
  const trimmed = prevReports.slice(-MAX_BROWSER_REPORTS);

  const agg = asRecord(body.samples_aggregate);
  const maxPlf = pickNumber(agg.max_packets_lost_fraction);
  if (maxPlf != null && maxPlf >= 0.08) {
    console.warn(
      "[call-quality]",
      JSON.stringify({
        event: "browser_report_high_packet_loss",
        phone_call_id: row.id,
        external_call_id_tail: row.external_call_id.length > 10 ? row.external_call_id.slice(-8) : row.external_call_id,
        max_packets_lost_fraction: maxPlf,
        staff_user_id_tail: staff.user_id.length > 8 ? `${staff.user_id.slice(0, 4)}…` : staff.user_id,
      })
    );
  }

  const warnings = body.webrtc_warnings;
  if (Array.isArray(warnings)) {
    for (const w of warnings) {
      const o = asRecord(w);
      const name = typeof o.name === "string" ? o.name.toLowerCase() : "";
      if (name.includes("ice") && name.includes("lost")) {
        console.warn(
          "[call-quality]",
          JSON.stringify({
            event: "browser_report_ice_warning",
            phone_call_id: row.id,
            warning: o.name,
          })
        );
        break;
      }
    }
  }

  const nextMeta = {
    ...prevMeta,
    call_quality: {
      ...prevCq,
      client_browser_reports: trimmed,
      last_browser_report_at: receivedAt,
    },
  };

  const { error: upErr } = await supabaseAdmin
    .from("phone_calls")
    .update({ metadata: nextMeta })
    .eq("id", row.id);

  if (upErr) {
    console.warn("[call-quality-report] metadata update:", upErr.message);
    return NextResponse.json({ ok: false, error: "Persist failed" }, { status: 500 });
  }

  const { error: evErr } = await supabaseAdmin.from("phone_call_events").insert({
    call_id: row.id,
    event_type: "call_quality.browser_session",
    payload: {
      twilio_call_sid: twilioCallSid,
      staff_user_id: staff.user_id,
      summary: {
        direction: body.direction,
        answered_by: body.answered_by,
        sample_count: pickNumber(agg.sample_count),
        max_packets_lost_fraction: maxPlf,
        max_jitter_ms: pickNumber(agg.max_jitter_ms),
        max_rtt_ms: pickNumber(agg.max_rtt_ms),
        warning_count: Array.isArray(body.webrtc_warnings) ? body.webrtc_warnings.length : 0,
      },
    },
  });

  if (evErr) {
    console.warn("[call-quality-report] event insert:", evErr.message);
  }

  return NextResponse.json({ ok: true, phone_call_id: row.id });
}
