import type { StaffProfile } from "@/lib/staff-profile";
import {
  hasFullCallVisibility,
  isAssignedPhoneScopedStaff,
  isPhoneWorkspaceUser,
} from "@/lib/staff-profile";
import { shouldUsePstnBridgeOutbound } from "@/lib/phone/outbound-pstn-bridge-config";
import { staffHasOutboundPstnBridgeCell } from "@/lib/phone/staff-outbound-cell";

export type StaffPhoneDialContext = {
  /** Voice-capable E.164 from twilio_phone_numbers when assigned to this user */
  crmAssignedVoiceE164: string | null;
};

function staffHasTelephonyAccess(p: StaffProfile | null | undefined): p is StaffProfile {
  if (!p || p.is_active === false || !isPhoneWorkspaceUser(p)) return false;
  return p.phone_access_enabled === true;
}

export function staffUsesDedicatedAssignment(profile: StaffProfile): boolean {
  return (
    profile.phone_assignment_mode === "dedicated" || profile.phone_assignment_mode === "dedicated_and_shared"
  );
}

export function staffUsesSharedCompanyLine(profile: StaffProfile): boolean {
  return profile.phone_assignment_mode === "shared" || profile.phone_assignment_mode === "dedicated_and_shared";
}

export function sharedLineAllowsFullAccess(profile: StaffProfile): boolean {
  return profile.shared_line_permissions.full_access === true;
}

export function sharedLineAllowsOutbound(profile: StaffProfile): boolean {
  if (sharedLineAllowsFullAccess(profile)) return true;
  return profile.shared_line_permissions.outbound_only === true;
}

export function sharedLineAllowsReceiveVoice(profile: StaffProfile): boolean {
  if (sharedLineAllowsFullAccess(profile)) return true;
  return profile.shared_line_permissions.receive_voice === true;
}

export function sharedLineAllowsSms(profile: StaffProfile): boolean {
  if (sharedLineAllowsFullAccess(profile)) return true;
  return profile.shared_line_permissions.sms === true;
}

export function sharedLineAllowsVoicemail(profile: StaffProfile): boolean {
  if (sharedLineAllowsFullAccess(profile)) return true;
  return profile.shared_line_permissions.voicemail === true;
}

export function sharedLineAllowsCallHistory(profile: StaffProfile): boolean {
  if (sharedLineAllowsFullAccess(profile)) return true;
  return profile.shared_line_permissions.call_history === true;
}

/**
 * Outbound via Twilio REST → staff cell → patient (no browser/WebRTC for the outbound path).
 * Does not require `softphone_web_enabled` so teams can turn off web softphone but keep CRM click-to-call.
 */
/**
 * Optional “Call via cell” / Verizon bridge from the UI (independent of `TWILIO_OUTBOUND_CALL_STRATEGY`).
 * Requires phone permissions plus a staff cell (`sms_notify_phone` or `TWILIO_OUTBOUND_DEFAULT_STAFF_E164`).
 */
export function staffMayUseManualOutboundPstnBridge(profile: StaffProfile, ctx: StaffPhoneDialContext): boolean {
  if (!staffMayDialOutboundPstnBridge(profile, ctx)) return false;
  return staffHasOutboundPstnBridgeCell(profile);
}

export function staffMayDialOutboundPstnBridge(profile: StaffProfile, ctx: StaffPhoneDialContext): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;
  if (profile.phone_calling_profile === "inbound_disabled") return false;

  if (isAssignedPhoneScopedStaff(profile)) {
    return Boolean(ctx.crmAssignedVoiceE164);
  }

  if (hasFullCallVisibility(profile) && profile.phone_assignment_mode === "organization_default") {
    return true;
  }

  if (staffUsesDedicatedAssignment(profile)) {
    if (ctx.crmAssignedVoiceE164) return true;
    const manual = profile.dedicated_outbound_e164?.trim();
    if (manual) return true;
  }

  if (staffUsesSharedCompanyLine(profile)) {
    return sharedLineAllowsOutbound(profile);
  }

  return false;
}

export function staffMayDialOutbound(profile: StaffProfile, ctx: StaffPhoneDialContext): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;
  if (profile.softphone_web_enabled === false) return false;
  if (profile.phone_calling_profile === "inbound_disabled") return false;

  if (isAssignedPhoneScopedStaff(profile)) {
    return Boolean(ctx.crmAssignedVoiceE164);
  }

  if (hasFullCallVisibility(profile) && profile.phone_assignment_mode === "organization_default") {
    return true;
  }

  if (staffUsesDedicatedAssignment(profile)) {
    if (ctx.crmAssignedVoiceE164) return true;
    const manual = profile.dedicated_outbound_e164?.trim();
    if (manual) return true;
  }

  if (staffUsesSharedCompanyLine(profile)) {
    return sharedLineAllowsOutbound(profile);
  }

  return false;
}

export function staffMayReceiveVoiceCalls(profile: StaffProfile, ctx: StaffPhoneDialContext): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;
  if (profile.phone_calling_profile !== "inbound_outbound") return false;

  if (isAssignedPhoneScopedStaff(profile)) {
    return Boolean(ctx.crmAssignedVoiceE164);
  }

  if (hasFullCallVisibility(profile) && profile.phone_assignment_mode === "organization_default") {
    return true;
  }

  if (staffUsesSharedCompanyLine(profile)) {
    return sharedLineAllowsReceiveVoice(profile);
  }

  if (staffUsesDedicatedAssignment(profile) && ctx.crmAssignedVoiceE164) {
    return true;
  }

  return false;
}

export function staffMayRegisterTwilioSoftphone(profile: StaffProfile, ctx: StaffPhoneDialContext): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;
  if (profile.softphone_web_enabled === false) return false;
  return staffMayDialOutbound(profile, ctx) || staffMayReceiveVoiceCalls(profile, ctx);
}

/** Browser fetches token for identity / native bridge; includes PSTN-bridge-only staff when web softphone is off. */
export function staffMayMintTwilioVoiceToken(profile: StaffProfile, ctx: StaffPhoneDialContext): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;
  if (staffMayRegisterTwilioSoftphone(profile, ctx)) return true;
  return shouldUsePstnBridgeOutbound() && staffMayDialOutboundPstnBridge(profile, ctx);
}

/**
 * Skip `Twilio.Device.register` in the browser when web softphone is disabled but PSTN bridge outbound is allowed.
 */
export function shouldSkipBrowserTwilioDeviceRegistration(
  profile: StaffProfile,
  ctx: StaffPhoneDialContext
): boolean {
  if (profile.softphone_web_enabled !== false) return false;
  return shouldUsePstnBridgeOutbound() && staffMayDialOutboundPstnBridge(profile, ctx);
}

export function staffMayAccessWorkspaceSms(profile: StaffProfile): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;
  if (profile.sms_messaging_enabled === false) return false;

  if (isAssignedPhoneScopedStaff(profile)) {
    return (
      profile.phone_assignment_mode === "dedicated" ||
      profile.phone_assignment_mode === "dedicated_and_shared"
    );
  }

  if (hasFullCallVisibility(profile) && profile.phone_assignment_mode === "organization_default") {
    return true;
  }

  if (staffUsesDedicatedAssignment(profile)) {
    return true;
  }

  if (staffUsesSharedCompanyLine(profile)) {
    return sharedLineAllowsSms(profile);
  }

  return false;
}

export function staffMayAccessWorkspaceVoicemail(profile: StaffProfile): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;
  if (profile.voicemail_access_enabled === false) return false;

  if (isAssignedPhoneScopedStaff(profile)) {
    return (
      profile.phone_assignment_mode === "dedicated" ||
      profile.phone_assignment_mode === "dedicated_and_shared"
    );
  }

  if (hasFullCallVisibility(profile) && profile.phone_assignment_mode === "organization_default") {
    return true;
  }

  if (staffUsesDedicatedAssignment(profile)) {
    return true;
  }

  if (staffUsesSharedCompanyLine(profile)) {
    return sharedLineAllowsVoicemail(profile);
  }

  return false;
}

export function staffMayAccessWorkspaceCallHistory(profile: StaffProfile): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;

  if (isAssignedPhoneScopedStaff(profile)) {
    return (
      profile.phone_assignment_mode === "dedicated" ||
      profile.phone_assignment_mode === "dedicated_and_shared"
    );
  }

  if (hasFullCallVisibility(profile) && profile.phone_assignment_mode === "organization_default") {
    return true;
  }

  if (staffUsesDedicatedAssignment(profile)) {
    return true;
  }

  if (staffUsesSharedCompanyLine(profile)) {
    return sharedLineAllowsCallHistory(profile);
  }

  return false;
}
