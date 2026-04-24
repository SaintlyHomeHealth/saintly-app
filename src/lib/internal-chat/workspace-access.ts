import type { StaffProfile } from "@/lib/staff-profile";
import { canAccessWorkspacePhone } from "@/lib/staff-profile";
import { resolveEffectivePageAccess, type StaffPageKey } from "@/lib/staff-page-access";

const CHAT_PAGE_KEY: StaffPageKey = "workspace_followups";

export function canAccessWorkspaceInternalChat(staff: StaffProfile | null): boolean {
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return false;
  }
  const access = resolveEffectivePageAccess(staff);
  return access[CHAT_PAGE_KEY] === true;
}
