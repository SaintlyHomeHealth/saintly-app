import type { StaffProfile } from "@/lib/staff-profile";
import { isAdminOrHigher } from "@/lib/staff-profile";

/** Owners/admins may see private business inbox references (info@). */
export function canViewPrivateBusinessEmail(staff: StaffProfile | null | undefined): boolean {
  return isAdminOrHigher(staff);
}

/** Owners/admins see all CRM email marketing history. */
export function canViewAllEmailMarketingHistory(staff: StaffProfile | null | undefined): boolean {
  return isAdminOrHigher(staff);
}

export function staffFacingBusinessEmail(staff: StaffProfile | null | undefined): string {
  return canViewPrivateBusinessEmail(staff)
    ? process.env.EMAIL_REPLY_TO?.trim() || "info@saintlyhomehealth.com"
    : "admin@saintlyhomehealth.com";
}
