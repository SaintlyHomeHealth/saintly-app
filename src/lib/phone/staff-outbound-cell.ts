import type { StaffProfile } from "@/lib/staff-profile";
import { normalizeDialInputToE164, isValidE164 } from "@/lib/softphone/phone-number";

/**
 * PSTN bridge: ring this staff member’s personal cell first.
 * Prefer `staff_profiles.sms_notify_phone`; fall back to `TWILIO_OUTBOUND_DEFAULT_STAFF_E164` (dev / single-user).
 */
export function resolveStaffOutboundCellE164(staff: Pick<StaffProfile, "sms_notify_phone">): string | null {
  const rawProfile = typeof staff.sms_notify_phone === "string" ? staff.sms_notify_phone.trim() : "";
  if (rawProfile) {
    if (isValidE164(rawProfile)) return rawProfile;
    const n = normalizeDialInputToE164(rawProfile);
    if (n && isValidE164(n)) return n;
  }
  const envFallback = process.env.TWILIO_OUTBOUND_DEFAULT_STAFF_E164?.trim() ?? "";
  if (!envFallback) return null;
  if (isValidE164(envFallback)) return envFallback;
  const n2 = normalizeDialInputToE164(envFallback);
  return n2 && isValidE164(n2) ? n2 : null;
}

/** True when this staff member can be rung for optional manual PSTN-bridge outbound. */
export function staffHasOutboundPstnBridgeCell(staff: Pick<StaffProfile, "sms_notify_phone">): boolean {
  return Boolean(resolveStaffOutboundCellE164(staff));
}
