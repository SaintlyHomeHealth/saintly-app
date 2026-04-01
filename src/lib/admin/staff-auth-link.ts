import "server-only";

import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { supabaseAdmin } from "@/lib/admin";

export type StaffRowForAuthSync = {
  id: string;
  user_id: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  phone_access_enabled: boolean;
  inbound_ring_enabled: boolean;
};

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const want = normalizeStaffLookupEmail(email);
  let page = 1;
  const perPage = 1000;
  for (let i = 0; i < 100; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn("[staff-auth-link] listUsers:", error.message);
      return null;
    }
    const users = data.users;
    if (!users.length) break;
    for (const u of users) {
      if ((u.email ?? "").toLowerCase() === want) return u.id;
    }
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

export async function assertAuthUserExclusiveToStaffProfile(
  authUserId: string,
  staffProfileId: string
): Promise<{ ok: true } | { ok: false; error: "auth_user_linked_elsewhere" }> {
  const { data } = await supabaseAdmin
    .from("staff_profiles")
    .select("id")
    .eq("user_id", authUserId)
    .neq("id", staffProfileId)
    .maybeSingle();

  if (data?.id) {
    return { ok: false, error: "auth_user_linked_elsewhere" };
  }
  return { ok: true };
}

/**
 * Sets user_id to the auth user, email to the exact value from Auth, and rewrites
 * role / flags from the current row snapshot so staff_profiles stays consistent.
 */
export async function syncStaffProfileWithAuthUser(
  row: StaffRowForAuthSync,
  authUserId: string
): Promise<
  { ok: true; authEmail: string } | { ok: false; error: string; detail?: string }
> {
  const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (uErr || !userRes?.user) {
    return {
      ok: false,
      error: "auth_user_load_failed",
      detail: uErr?.message,
    };
  }

  const authEmail = userRes.user.email?.trim() ?? "";
  if (!authEmail) {
    return { ok: false, error: "auth_user_missing_email" };
  }

  const ex = await assertAuthUserExclusiveToStaffProfile(authUserId, row.id);
  if (!ex.ok) {
    return { ok: false, error: ex.error };
  }

  const { error: upErr } = await supabaseAdmin
    .from("staff_profiles")
    .update({
      user_id: authUserId,
      email: authEmail,
      role: row.role,
      is_active: row.is_active,
      phone_access_enabled: row.phone_access_enabled,
      inbound_ring_enabled: row.inbound_ring_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (upErr) {
    return { ok: false, error: "link_failed", detail: upErr.message };
  }

  return { ok: true, authEmail };
}

export { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
