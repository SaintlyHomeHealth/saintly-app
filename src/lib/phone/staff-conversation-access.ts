import type { StaffProfile } from "@/lib/staff-profile";
import {
  canStaffClaimPhoneCall,
  type PhoneCallVisibilityRow,
} from "@/lib/phone/staff-call-access";

/** Subset of conversation fields used for claim/unassign checks. */
export type ConversationVisibilityRow = PhoneCallVisibilityRow;

export function canStaffClaimConversation(
  staff: StaffProfile,
  row: ConversationVisibilityRow
): boolean {
  return canStaffClaimPhoneCall(staff, row);
}
