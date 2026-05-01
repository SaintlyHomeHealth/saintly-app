import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility, isPhoneWorkspaceUser } from "@/lib/staff-profile";

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

export function staffMayDialOutbound(profile: StaffProfile, ctx: StaffPhoneDialContext): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;
  if (profile.softphone_web_enabled === false) return false;
  if (profile.phone_calling_profile === "inbound_disabled") return false;

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

export function staffMayAccessWorkspaceSms(profile: StaffProfile): boolean {
  if (!staffHasTelephonyAccess(profile)) return false;
  if (profile.sms_messaging_enabled === false) return false;

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
