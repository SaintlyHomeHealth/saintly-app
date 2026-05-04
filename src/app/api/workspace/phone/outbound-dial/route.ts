import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { staffMayRegisterTwilioSoftphone } from "@/lib/phone/staff-phone-policy";
import {
  parseWorkspaceOutboundDialInput,
  sanitizeWorkspaceDialInput,
  isValidE164,
} from "@/lib/softphone/phone-number";
import {
  canAccessWorkspacePhone,
  resolveStaffProfileForWorkspacePhoneApi,
} from "@/lib/staff-profile";
import { loadAssignedTwilioNumberForUser } from "@/lib/twilio/twilio-phone-number-repo";

const INVALID_NUMBER_BODY = { ok: false as const, error: "Invalid phone number" };

export const dynamic = "force-dynamic";

/**
 * Pre-flight validation before Twilio Client connects / native shell starts an outbound leg.
 * Does not call Twilio — fast JSON gate for malformed dial input.
 */
export async function POST(req: NextRequest) {
  const staff = await resolveStaffProfileForWorkspacePhoneApi(req);
  if (!staff) {
    console.warn("[workspace/phone/outbound-dial] deny_no_staff", {
      hasAuthHeader: Boolean(req.headers.get("authorization")?.startsWith("Bearer ")),
    });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessWorkspacePhone(staff)) {
    console.warn("[workspace/phone/outbound-dial] deny_phone_workspace_gate", {
      userId: staff.user_id,
      phone_access_enabled: staff.phone_access_enabled,
      role: staff.role,
    });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (staff.softphone_web_enabled === false) {
    console.warn("[workspace/phone/outbound-dial] deny_softphone_web_disabled", { userId: staff.user_id });
    return NextResponse.json(
      { ok: false, error: "Web softphone is disabled for this staff member." },
      { status: 403 }
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
  if (!staffMayRegisterTwilioSoftphone(staff, dialCtx)) {
    console.warn("[workspace/phone/outbound-dial] deny_staff_may_not_register_softphone", {
      userId: staff.user_id,
      phone_calling_profile: staff.phone_calling_profile,
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          "Phone calling is not enabled for this account (Staff Access → Phone permissions). Contact an administrator.",
      },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    console.warn("[workspace/phone/outbound-dial] invalid_json");
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as { to?: unknown };
  const raw =
    typeof b.to === "string" ? b.to : b.to != null && (typeof b.to === "number" || typeof b.to === "bigint") ? String(b.to) : "";
  const normalized = sanitizeWorkspaceDialInput(raw);
  const parsed = parseWorkspaceOutboundDialInput(normalized);
  if (!parsed.ok) {
    console.warn("[workspace/phone/outbound-dial] validation_failed", {
      raw: raw.length > 120 ? `${raw.slice(0, 120)}…` : raw,
      normalized: normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized,
      reason: parsed.reason,
    });
    return NextResponse.json(INVALID_NUMBER_BODY, { status: 400 });
  }

  return NextResponse.json({ ok: true as const, e164: parsed.e164 });
}
