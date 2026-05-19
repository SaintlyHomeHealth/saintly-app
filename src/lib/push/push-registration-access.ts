import type { StaffProfile } from "@/lib/staff-profile";
import {
  canAccessWorkspacePhone,
  canUseWorkspacePhoneAppShell,
  isSalesAgentRole,
} from "@/lib/staff-profile";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";

/** Who may register FCM tokens from the mobile WebView (beyond telephony-only staff). */
export function canRegisterMobilePushNotifications(staff: StaffProfile | null | undefined): boolean {
  if (!staff || !canUseWorkspacePhoneAppShell(staff)) {
    return false;
  }
  if (canAccessWorkspacePhone(staff)) {
    return true;
  }
  if (canAccessWorkspaceInternalChat(staff)) {
    return true;
  }
  if (isSalesAgentRole(staff)) {
    return true;
  }
  return false;
}
