import "server-only";

import { resolveEffectivePageAccess } from "@/lib/staff-page-access";
import type { StaffProfile } from "@/lib/staff-profile";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

/** CRM Tasks: same staffing gate as CRM lead pages (manager+ with Leads module enabled). */
export async function requireCrmTasksStaff(): Promise<
  { ok: true; staff: StaffProfile } | { ok: false; status: 401 | 403; error: string }
> {
  const staff = await getStaffProfile();
  if (!staff) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!isManagerOrHigher(staff)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const access = resolveEffectivePageAccess(staff);
  if (access.leads !== true) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, staff };
}
