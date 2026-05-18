import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import twilio from "twilio";

import { supabaseAdmin } from "@/lib/admin";
import {
  resolveOutboundStaffRingSeconds,
  shouldUsePstnBridgeOutbound,
} from "@/lib/phone/outbound-pstn-bridge-config";
import { mintOutboundPstnBridgeToken } from "@/lib/phone/outbound-pstn-bridge-token";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { resolveStaffOutboundCellE164 } from "@/lib/phone/staff-outbound-cell";
import { staffMayDialOutboundPstnBridge } from "@/lib/phone/staff-phone-policy";
import {
  parseWorkspaceOutboundDialInput,
  sanitizeWorkspaceDialInput,
  isValidE164,
} from "@/lib/softphone/phone-number";
import {
  buildSoftphoneOutboundAllowlist,
  loadSoftphoneOutboundCallerConfigFromEnv,
  resolveSoftphoneOutboundFromE164,
} from "@/lib/softphone/outbound-caller-ids";
import {
  canAccessWorkspacePhone,
  resolveStaffProfileForWorkspacePhoneApi,
} from "@/lib/staff-profile";
import { loadAssignedTwilioNumberForUser } from "@/lib/twilio/twilio-phone-number-repo";

export const dynamic = "force-dynamic";

const LOG_TAG = "outbound-pstn-bridge";

/**
 * CRM / keypad: start click-to-call — Twilio REST dials staff cell first; staff-screen TwiML handles press 1 then patient.
 */
export async function POST(req: NextRequest) {
  const staff = await resolveStaffProfileForWorkspacePhoneApi(req);
  if (!staff || !canAccessWorkspacePhone(staff)) {
    console.warn(`[${LOG_TAG}] deny_unauthorized`);
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!shouldUsePstnBridgeOutbound()) {
    console.warn(`[${LOG_TAG}] deny_strategy_not_pstn_bridge`);
    return NextResponse.json(
      { ok: false, error: "PSTN bridge outbound is not enabled (TWILIO_OUTBOUND_CALL_STRATEGY / DISABLE_CLIENT)." },
      { status: 400 }
    );
  }

  let crmAssignedVoiceE164: string | null = null;
  try {
    const assignedRow = await loadAssignedTwilioNumberForUser(supabaseAdmin, staff.user_id);
    const pn = assignedRow?.phone_number?.trim() ?? "";
    if (pn && isValidE164(pn) && assignedRow?.voice_enabled !== false) {
      crmAssignedVoiceE164 = pn;
    }
  } catch {
    crmAssignedVoiceE164 = null;
  }
  const dialCtx = { crmAssignedVoiceE164 };

  if (!staffMayDialOutboundPstnBridge(staff, dialCtx)) {
    console.warn(`[${LOG_TAG}] deny_staff_may_not_dial_pstn_bridge`, { userId: staff.user_id });
    return NextResponse.json(
      {
        ok: false,
        error:
          "Phone outbound is not enabled for this account (Staff Access → Phone permissions). Contact an administrator.",
      },
      { status: 403 }
    );
  }

  const staffCell = resolveStaffOutboundCellE164(staff);
  if (!staffCell) {
    console.warn(`[${LOG_TAG}] deny_no_staff_cell`, { userId: staff.user_id });
    return NextResponse.json(
      {
        ok: false,
        error:
          "No staff cell number configured. Add sms_notify_phone on your staff profile or set TWILIO_OUTBOUND_DEFAULT_STAFF_E164.",
      },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as { to?: unknown; outboundCli?: unknown };
  const rawTo =
    typeof b.to === "string" ? b.to : b.to != null && (typeof b.to === "number" || typeof b.to === "bigint") ? String(b.to) : "";
  const normalizedTo = sanitizeWorkspaceDialInput(rawTo);
  const parsedTo = parseWorkspaceOutboundDialInput(normalizedTo);
  if (!parsedTo.ok) {
    console.warn(`[${LOG_TAG}] validation_failed`, { reason: parsedTo.reason });
    return NextResponse.json({ ok: false, error: "Invalid phone number" }, { status: 400 });
  }
  const patientE164 = parsedTo.e164;

  const outboundCfg = loadSoftphoneOutboundCallerConfigFromEnv();
  const envPrimary = process.env.TWILIO_SOFTPHONE_CALLER_ID_E164?.trim() || "";
  const allowlist = outboundCfg ? buildSoftphoneOutboundAllowlist(outboundCfg) : new Set<string>();
  if (staff.user_id) {
    try {
      const assignedRow = await loadAssignedTwilioNumberForUser(supabaseAdmin, staff.user_id);
      const pn = assignedRow?.phone_number?.trim() ?? "";
      if (pn && isValidE164(pn) && assignedRow?.voice_enabled !== false) {
        allowlist.add(pn);
      }
    } catch {
      /* optional */
    }
  }
  const outboundCliRaw = typeof b.outboundCli === "string" ? b.outboundCli.trim() : undefined;
  const resolvedFrom = outboundCfg
    ? resolveSoftphoneOutboundFromE164({ config: outboundCfg, outboundCliRaw, allowlist })
    : { e164: envPrimary, requestedPresentation: "default" as const };
  const presentationCli = resolvedFrom.e164;
  if (!presentationCli || !isValidE164(presentationCli)) {
    console.warn(`[${LOG_TAG}] deny_missing_cli`);
    return NextResponse.json(
      { ok: false, error: "Outbound caller ID is not configured (TWILIO_SOFTPHONE_CALLER_ID_E164)." },
      { status: 503 }
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!accountSid || !authToken || !publicBase) {
    console.error(`[${LOG_TAG}] missing_twilio_env`);
    return NextResponse.json({ ok: false, error: "Calling is not configured on the server." }, { status: 503 });
  }

  let token: string;
  try {
    token = mintOutboundPstnBridgeToken({
      patient: patientE164,
      cli: presentationCli,
      staff: staff.user_id,
    });
  } catch {
    console.error(`[${LOG_TAG}] token_mint_failed`);
    return NextResponse.json({ ok: false, error: "Could not start call (signing)." }, { status: 503 });
  }

  const staffScreenUrl = `${publicBase}/api/twilio/voice/outbound-pstn-bridge/staff-screen?token=${encodeURIComponent(token)}`;
  const statusUrl = `${publicBase}/api/twilio/voice/outbound-pstn-bridge/status`;
  const staffRingSec = resolveOutboundStaffRingSeconds();

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "outbound_requested",
      staff_user_id_tail: staff.user_id.length >= 8 ? staff.user_id.slice(-8) : staff.user_id,
      staff_cell_tail: staffCell.replace(/\D/g, "").slice(-4),
      patient_tail: patientE164.replace(/\D/g, "").slice(-4),
      presentation_cli_tail: presentationCli.replace(/\D/g, "").slice(-4),
      staff_ring_sec: staffRingSec,
      cli_presentation: resolvedFrom.requestedPresentation,
    })
  );

  try {
    const client = twilio(accountSid, authToken);
    const call = await client.calls.create({
      to: staffCell,
      from: presentationCli,
      url: staffScreenUrl,
      method: "POST",
      timeout: staffRingSec,
      statusCallback: statusUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });

    const callSid = typeof call.sid === "string" ? call.sid : null;
    if (!callSid) {
      console.error(`[${LOG_TAG}] twilio_no_sid`);
      return NextResponse.json({ ok: false, error: "Twilio did not return a call SID." }, { status: 502 });
    }

    const startedAt = new Date().toISOString();
    const logResult = await upsertPhoneCallFromWebhook(supabaseAdmin, {
      external_call_id: callSid,
      direction: "outbound",
      from_e164: presentationCli,
      to_e164: patientE164,
      status: "initiated",
      event_type: "outbound.pstn_bridge_staff_leg_initiated",
      started_at: startedAt,
      owner_user_id: staff.user_id,
      metadata: {
        source: "outbound_pstn_bridge",
        phase: "staff_leg_ringing",
        staff_cell_e164_tail: staffCell.replace(/\D/g, "").slice(-4),
        patient_e164_tail: patientE164.replace(/\D/g, "").slice(-4),
        presentation_cli_tail: presentationCli.replace(/\D/g, "").slice(-4),
        ...(outboundCliRaw
          ? { softphone_outbound_cli_request: outboundCliRaw, cli_presentation: resolvedFrom.requestedPresentation }
          : {}),
      },
    });
    if (!logResult.ok) {
      console.error(`[${LOG_TAG}] phone_log_failed`, logResult.error);
    }

    return NextResponse.json({
      ok: true as const,
      call_sid: callSid,
      message: "Calling your phone. Answer and press 1 to connect to the patient.",
    });
  } catch (e) {
    console.error(`[${LOG_TAG}] twilio_calls_create_failed`, e);
    return NextResponse.json({ ok: false, error: "Could not start your callback phone call." }, { status: 502 });
  }
}
