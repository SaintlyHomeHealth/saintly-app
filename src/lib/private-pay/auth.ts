import type { User } from "@supabase/supabase-js";

import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isCrmLeadsRowPolicyRole, type StaffProfile } from "@/lib/staff-profile";

export type PrivatePayAuthOk = { user: User; staff: StaffProfile };

/**
 * Private-pay billing is restricted to manager / admin / super_admin — the same
 * roles allowed by the private_pay_* RLS policies. Because server routes use the
 * service role (supabaseAdmin), this check IS the security boundary.
 */
export async function requirePrivatePayStaff(): Promise<
  { ok: true; auth: PrivatePayAuthOk } | { ok: false; status: 401 | 403; error: string }
> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, auth: { user, staff } };
}
