import type { User } from "@supabase/supabase-js";

import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher, type StaffProfile } from "@/lib/staff-profile";

export type AdminApiAuthOk = {
  user: User;
  staff: StaffProfile;
};

export async function requireAdminApiSession (): Promise<
  | { ok: true; auth: AdminApiAuthOk }
  | { ok: false; status: 401 | 403; error: string }
> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, auth: { user, staff } };
}
