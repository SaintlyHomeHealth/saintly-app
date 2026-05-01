import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  buildSoftphoneOutboundAllowlist,
  loadSoftphoneOutboundCallerConfigFromEnv,
} from "@/lib/softphone/outbound-caller-ids";
import { isValidE164 } from "@/lib/softphone/phone-number";
import {
  sharedLineAllowsOutbound,
  staffMayDialOutbound,
  staffUsesDedicatedAssignment,
  staffUsesSharedCompanyLine,
} from "@/lib/phone/staff-phone-policy";
import { canAccessWorkspacePhone, getStaffProfile, hasFullCallVisibility } from "@/lib/staff-profile";
import { loadAssignedTwilioNumberForUser } from "@/lib/twilio/twilio-phone-number-repo";
import { resolveTwilioMediaStreamWssUrl } from "@/lib/twilio/resolve-media-stream-wss-url";
import { resolveTranscriptionStatusCallbackUrl } from "@/lib/twilio/resolve-transcription-callback-url";

type OutboundLinePayload = { e164: string; label: string; is_default: boolean };

/**
 * Non-secret flags for workspace softphone UI (conference + media stream + transcription).
 */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let assignedRow = null as Awaited<ReturnType<typeof loadAssignedTwilioNumberForUser>>;
  try {
    assignedRow = await loadAssignedTwilioNumberForUser(supabaseAdmin, staff.user_id);
  } catch {
    assignedRow = null;
  }

  const assignedVoiceE164 =
    assignedRow?.phone_number?.trim() &&
    isValidE164(assignedRow.phone_number.trim()) &&
    assignedRow.voice_enabled !== false
      ? assignedRow.phone_number.trim()
      : null;

  const assignedVoiceLabel =
    typeof assignedRow?.label === "string" && assignedRow.label.trim()
      ? assignedRow.label.trim().slice(0, 80)
      : "My line";

  const dialCtx = { crmAssignedVoiceE164: assignedVoiceE164 };

  const wss = resolveTwilioMediaStreamWssUrl();
  const callbackUrl = resolveTranscriptionStatusCallbackUrl();
  const legacyBridge = Boolean(process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim());
  const outboundCfg = loadSoftphoneOutboundCallerConfigFromEnv();
  const allowlist = outboundCfg ? buildSoftphoneOutboundAllowlist(outboundCfg) : new Set<string>();

  const full = hasFullCallVisibility(staff);
  const mode = staff.phone_assignment_mode;

  let lines: OutboundLinePayload[] = [];
  let defaultE164: string | null = null;

  if (full && mode === "organization_default") {
    if (outboundCfg) {
      lines = outboundCfg.lines.map((l) => ({
        e164: l.e164,
        label: l.label,
        is_default: l.is_default,
      }));
      defaultE164 = outboundCfg.defaultE164;
      const dedicatedManual = staff.dedicated_outbound_e164?.trim() ?? "";
      if (dedicatedManual && isValidE164(dedicatedManual) && allowlist.has(dedicatedManual)) {
        lines = lines.map((l) => ({ ...l, is_default: l.e164 === dedicatedManual }));
        defaultE164 = dedicatedManual;
      }
      if (assignedVoiceE164 && !lines.some((l) => l.e164 === assignedVoiceE164)) {
        lines = [
          ...lines,
          { e164: assignedVoiceE164, label: assignedVoiceLabel, is_default: false },
        ];
      }
    }
  } else {
    const ded: OutboundLinePayload[] = [];
    if (staffUsesDedicatedAssignment(staff)) {
      if (assignedVoiceE164) {
        ded.push({ e164: assignedVoiceE164, label: assignedVoiceLabel, is_default: true });
      } else {
        const manual = staff.dedicated_outbound_e164?.trim() ?? "";
        if (manual && isValidE164(manual) && outboundCfg && allowlist.has(manual)) {
          ded.push({ e164: manual, label: "Dedicated line", is_default: true });
        }
      }
    }

    const shared: OutboundLinePayload[] = [];
    if (staffUsesSharedCompanyLine(staff) && sharedLineAllowsOutbound(staff) && outboundCfg) {
      shared.push(
        ...outboundCfg.lines.map((l) => ({
          e164: l.e164,
          label: l.label,
          is_default: false,
        }))
      );
    }

    const map = new Map<string, OutboundLinePayload>();
    for (const l of [...shared, ...ded]) {
      if (!map.has(l.e164)) map.set(l.e164, l);
    }
    lines = [...map.values()];

    if (staffUsesDedicatedAssignment(staff) && assignedVoiceE164) {
      defaultE164 = assignedVoiceE164;
      lines = lines.map((l) => ({ ...l, is_default: l.e164 === assignedVoiceE164 }));
    } else if (staffUsesDedicatedAssignment(staff)) {
      const manual = staff.dedicated_outbound_e164?.trim();
      if (manual && lines.some((l) => l.e164 === manual)) {
        defaultE164 = manual;
        lines = lines.map((l) => ({ ...l, is_default: l.e164 === manual }));
      }
    } else if (staffUsesSharedCompanyLine(staff) && sharedLineAllowsOutbound(staff) && outboundCfg) {
      defaultE164 = outboundCfg.defaultE164;
      lines = lines.map((l) => ({ ...l, is_default: l.e164 === outboundCfg.defaultE164 }));
    } else if (lines.length === 1) {
      defaultE164 = lines[0].e164;
      lines = lines.map((l) => ({ ...l, is_default: true }));
    } else if (lines.length > 1) {
      defaultE164 = lines.find((l) => l.is_default)?.e164 ?? lines[0]?.e164 ?? null;
    }
  }

  const keypadOutboundAllowed = staffMayDialOutbound(staff, dialCtx);
  if (!keypadOutboundAllowed) {
    lines = [];
    defaultE164 = null;
  }

  return NextResponse.json({
    conference_outbound_enabled: process.env.TWILIO_SOFTPHONE_USE_CONFERENCE === "true",
    media_stream_wss_configured: wss.startsWith("wss://"),
    transcription_callback_configured: Boolean(callbackUrl),
    legacy_bridge_transcript_configured: legacyBridge,
    transcript_writeback_configured: Boolean(callbackUrl) || legacyBridge,
    org_label: outboundCfg?.orgLabel ?? null,
    staff_user_id: staff.user_id,
    outbound_lines: lines,
    outbound_default_e164: defaultE164,
    outbound_block_available: Boolean(outboundCfg?.withheldCliE164),
    keypad_outbound_allowed: keypadOutboundAllowed,
  });
}
