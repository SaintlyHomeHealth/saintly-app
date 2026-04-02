import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

export type StaffRole = "super_admin" | "admin" | "manager" | "nurse";

export type StaffProfile = {
  id: string;
  user_id: string;
  email: string | null;
  role: StaffRole;
  created_at: string;
  updated_at: string;
  full_name: string | null;
  is_active: boolean;
  phone_access_enabled: boolean;
  inbound_ring_enabled: boolean;
};

/**
 * Higher number = more privilege. Used by `isAdminOrHigher` / `isManagerOrHigher`.
 * nurse=0, manager=1, admin=2, super_admin=3
 */
const ROLE_RANK: Record<StaffRole, number> = {
  nurse: 0,
  manager: 1,
  admin: 2,
  super_admin: 3,
};

export function isSuperAdmin(profile: StaffProfile | null | undefined): boolean {
  return profile?.role === "super_admin";
}

/** True for `super_admin` and `admin` only. */
export function isAdminOrHigher(profile: StaffProfile | null | undefined): boolean {
  if (!profile) return false;
  return ROLE_RANK[profile.role] >= ROLE_RANK.admin;
}

/** True for `super_admin`, `admin`, and `manager` (excludes `nurse`). */
export function isManagerOrHigher(profile: StaffProfile | null | undefined): boolean {
  if (!profile) return false;
  return ROLE_RANK[profile.role] >= ROLE_RANK.manager;
}

/**
 * Field / clinical staff who should use workspace phone only — not `/admin`.
 * DB roles today: `nurse`. Forward-compatible with `employee` / `staff` if added to `staff_profiles.role`.
 */
export function isWorkspaceEmployeeRole(role: string | null | undefined): boolean {
  const r = typeof role === "string" ? role.trim().toLowerCase() : "";
  return r === "nurse" || r === "employee" || r === "staff";
}

/** Phone workspace: active staff who may use /admin/phone (any clinical role). */
export function isPhoneWorkspaceUser(profile: StaffProfile | null | undefined): boolean {
  if (!profile || profile.is_active === false) return false;
  return (
    profile.role === "super_admin" ||
    profile.role === "admin" ||
    profile.role === "manager" ||
    profile.role === "nurse"
  );
}

/** See full org call list (not nurse-scoped). Equivalent to manager-or-above. */
export function hasFullCallVisibility(profile: StaffProfile | null | undefined): boolean {
  return isManagerOrHigher(profile);
}

/**
 * `/workspace/phone` shell: active nurses may enter without `phone_access_enabled` (that flag is often off in DB
 * for clinical staff). Managers/admins/super_admins still require `phone_access_enabled` so ops access stays gated.
 */
export function canAccessWorkspacePhone(profile: StaffProfile | null | undefined): boolean {
  if (!profile || profile.is_active === false || !isPhoneWorkspaceUser(profile)) return false;
  if (profile.role === "nurse") return true;
  return profile.phone_access_enabled === true;
}

function isStaffRole(value: string): value is StaffRole {
  return (
    value === "super_admin" ||
    value === "admin" ||
    value === "manager" ||
    value === "nurse"
  );
}

/**
 * Returns the staff profile for the current Supabase session user, or null if
 * unauthenticated or no matching row (including users who are not staff).
 */
export async function getStaffProfile(): Promise<StaffProfile | null> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("staff_profiles")
    .select(
      "id, user_id, email, role, created_at, updated_at, full_name, is_active, phone_access_enabled, inbound_ring_enabled"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const role = data.role;
  if (typeof role !== "string" || !isStaffRole(role)) {
    return null;
  }

  return {
    id: data.id,
    user_id: data.user_id,
    email: data.email ?? null,
    role,
    created_at: data.created_at,
    updated_at: data.updated_at,
    full_name: typeof data.full_name === "string" ? data.full_name : null,
    is_active: data.is_active !== false,
    phone_access_enabled: data.phone_access_enabled === true,
    inbound_ring_enabled: data.inbound_ring_enabled === true,
  };
}
