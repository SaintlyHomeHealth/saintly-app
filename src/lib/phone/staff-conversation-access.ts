import type { StaffProfile } from "@/lib/staff-profile";
import {
  canStaffAccessPhoneCallRow,
  canStaffClaimPhoneCall,
  type PhoneCallVisibilityRow,
} from "@/lib/phone/staff-call-access";

/** Same rules as phone calls: admin/manager see all; nurse sees unassigned + own. */
export type ConversationVisibilityRow = PhoneCallVisibilityRow;

export function canStaffAccessConversationRow(
  staff: StaffProfile,
  row: ConversationVisibilityRow
): boolean {
  return canStaffAccessPhoneCallRow(staff, row);
}

export function canStaffClaimConversation(
  staff: StaffProfile,
  row: ConversationVisibilityRow
): boolean {
  return canStaffClaimPhoneCall(staff, row);
}
