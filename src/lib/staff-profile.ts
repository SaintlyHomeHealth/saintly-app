import { cache } from "react";
import { createClient } from "@supabase/supabase-js";

import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

export type StaffRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "nurse"
  | "don"
  | "recruiter"
  | "billing"
  | "dispatch"
  | "credentialing"
  | "read_only";

export type PhoneAssignmentMode = "organization_default" | "dedicated" | "shared" | "dedicated_and_shared";

export type PhoneCallingProfile = "outbound_only" | "inbound_outbound" | "inbound_disabled";

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
  /** When set, maps this login to applicants.id (payroll / contracts). */
  applicant_id: string | null;
  /** Mobile for operational SMS (dispatch alerts, welcome texts). */
  sms_notify_phone: string | null;
  /** When false, workspace-first roles cannot open /admin until enabled in Staff Access. */
  admin_shell_access: boolean;
  page_access_preset: string | null;
  page_permissions: Record<string, boolean>;
  require_password_change: boolean;
  phone_assignment_mode: PhoneAssignmentMode;
  dedicated_outbound_e164: string | null;
  shared_line_e164: string | null;
  phone_calling_profile: PhoneCallingProfile;
  sms_messaging_enabled: boolean;
  voicemail_access_enabled: boolean;
  shared_line_permissions: Record<string, boolean>;
  softphone_mobile_enabled: boolean;
  softphone_web_enabled: boolean;
  push_notifications_enabled: boolean;
  call_recording_enabled: boolean;
};

/**
 * Higher number = more privilege. Used by `isAdminOrHigher` / `isManagerOrHigher`.
 */
const ROLE_RANK: Record<StaffRole, number> = {
  read_only: 0,
  nurse: 0,
  recruiter: 1,
  billing: 1,
  dispatch: 1,
  credentialing: 1,
  manager: 1,
  don: 1,
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

/**
 * Approve weekly payroll / mark batches paid / export — not managers.
 * DON-equivalent included.
 */
export function isPayrollApprover(profile: StaffProfile | null | undefined): boolean {
  const r = profile?.role;
  return r === "super_admin" || r === "admin" || r === "don";
}

/** True for manager-tier roles and above (excludes nurse/read_only). */
export function isManagerOrHigher(profile: StaffProfile | null | undefined): boolean {
  if (!profile) return false;
  return ROLE_RANK[profile.role] >= ROLE_RANK.manager;
}

/**
 * Field / clinical staff who should use workspace phone first — not `/admin` unless `admin_shell_access`.
 */
export function isWorkspaceEmployeeRole(role: string | null | undefined): boolean {
  const r = typeof role === "string" ? role.trim().toLowerCase() : "";
  return r === "nurse" || r === "employee" || r === "staff";
}

function staffMayUsePhoneWorkspaceRole(role: StaffRole): boolean {
  return (
    role === "super_admin" ||
    role === "admin" ||
    role === "manager" ||
    role === "nurse" ||
    role === "don" ||
    role === "recruiter" ||
    role === "billing" ||
    role === "dispatch" ||
    role === "credentialing"
  );
}

/** Phone workspace: active staff who may use workspace softphone shell / Twilio workspace routes. */
export function isPhoneWorkspaceUser(profile: StaffProfile | null | undefined): boolean {
  if (!profile || profile.is_active === false) return false;
  if (profile.role === "read_only") return false;
  return staffMayUsePhoneWorkspaceRole(profile.role);
}

/**
 * `/workspace/*` UI shell: any active app role (including read_only). Narrower than
 * `canAccessWorkspacePhone` — ops roles still need `phone_access_enabled` for tokens/APIs,
 * but everyone lands in the workspace shell after login.
 */
export function canAccessWorkspaceShell(profile: StaffProfile | null | undefined): boolean {
  if (!profile || profile.is_active === false) return false;
  return isStaffRole(profile.role);
}

/** See full org call list (not nurse-scoped). */
export function hasFullCallVisibility(profile: StaffProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === "read_only" || profile.role === "nurse") return false;
  return ROLE_RANK[profile.role] >= ROLE_RANK.manager;
}

/**
 * `/workspace/phone` telephony (SMS, Twilio softphone token, voicemail UI, workspace call log APIs).
 * Requires explicit Staff Access → Phone access ON (all roles including nurses).
 */
export function canAccessWorkspacePhone(profile: StaffProfile | null | undefined): boolean {
  if (!profile || profile.is_active === false || !isPhoneWorkspaceUser(profile)) return false;
  return profile.phone_access_enabled === true;
}

/** Visits board and similar workspace-phone tabs that do not require telephony entitlement. */
export function canUseWorkspacePhoneAppShell(profile: StaffProfile | null | undefined): boolean {
  if (!profile || profile.is_active === false || !isPhoneWorkspaceUser(profile)) return false;
  return true;
}

export function staffAllowsInboundSoftphone(profile: Pick<StaffProfile, "phone_calling_profile">): boolean {
  return profile.phone_calling_profile === "inbound_outbound";
}

/**
 * Same gate as GET `/api/softphone/token`: if true, Twilio Device may register (LIVE) and must be dialed
 * as `saintly_<auth_user_uuid>` on inbound. Used to build the inbound &lt;Client&gt; list.
 */
export function matchesSoftphoneTokenEligibilityForInboundRing(
  row: Pick<StaffProfile, "role" | "is_active" | "phone_access_enabled" | "phone_calling_profile">
): boolean {
  if (!staffAllowsInboundSoftphone(row)) return false;
  if (row.is_active !== true) return false;
  if (typeof row.role !== "string" || !isStaffRole(row.role)) return false;
  return canAccessWorkspacePhone({
    id: "",
    user_id: "",
    email: null,
    role: row.role,
    created_at: "",
    updated_at: "",
    full_name: null,
    is_active: true,
    phone_access_enabled: row.phone_access_enabled,
    inbound_ring_enabled: false,
    applicant_id: null,
    sms_notify_phone: null,
    admin_shell_access: true,
    page_access_preset: null,
    page_permissions: {},
    require_password_change: false,
    phone_assignment_mode: "organization_default",
    dedicated_outbound_e164: null,
    shared_line_e164: null,
    phone_calling_profile: row.phone_calling_profile,
    sms_messaging_enabled: true,
    voicemail_access_enabled: true,
    shared_line_permissions: {},
    softphone_mobile_enabled: true,
    softphone_web_enabled: true,
    push_notifications_enabled: true,
    call_recording_enabled: false,
  } as StaffProfile);
}

export function isStaffRole(value: string): value is StaffRole {
  return (
    value === "super_admin" ||
    value === "admin" ||
    value === "manager" ||
    value === "nurse" ||
    value === "don" ||
    value === "recruiter" ||
    value === "billing" ||
    value === "dispatch" ||
    value === "credentialing" ||
    value === "read_only"
  );
}

const STAFF_PROFILE_SELECT =
  "id, user_id, email, role, created_at, updated_at, full_name, is_active, phone_access_enabled, inbound_ring_enabled, applicant_id, sms_notify_phone, admin_shell_access, page_access_preset, page_permissions, require_password_change, phone_assignment_mode, dedicated_outbound_e164, shared_line_e164, phone_calling_profile, sms_messaging_enabled, voicemail_access_enabled, shared_line_permissions, softphone_mobile_enabled, softphone_web_enabled, push_notifications_enabled, call_recording_enabled";

function parsePagePermissions(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

function parseSharedLinePerms(raw: unknown): Record<string, boolean> {
  return parsePagePermissions(raw);
}

export function mapStaffRow(data: Record<string, unknown>): StaffProfile | null {
  const role = data.role;
  if (typeof role !== "string" || !isStaffRole(role)) {
    return null;
  }
  const phoneCalling =
    typeof data.phone_calling_profile === "string" &&
    (data.phone_calling_profile === "outbound_only" ||
      data.phone_calling_profile === "inbound_outbound" ||
      data.phone_calling_profile === "inbound_disabled")
      ? data.phone_calling_profile
      : "inbound_outbound";
  const assignMode =
    typeof data.phone_assignment_mode === "string" &&
    (data.phone_assignment_mode === "organization_default" ||
      data.phone_assignment_mode === "dedicated" ||
      data.phone_assignment_mode === "shared" ||
      data.phone_assignment_mode === "dedicated_and_shared")
      ? data.phone_assignment_mode
      : "organization_default";

  return {
    id: data.id as string,
    user_id: data.user_id as string,
    email: typeof data.email === "string" ? data.email : null,
    role,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
    full_name: typeof data.full_name === "string" ? data.full_name : null,
    is_active: data.is_active !== false,
    phone_access_enabled: data.phone_access_enabled === true,
    inbound_ring_enabled: data.inbound_ring_enabled === true,
    applicant_id: typeof data.applicant_id === "string" ? data.applicant_id : null,
    sms_notify_phone:
      typeof data.sms_notify_phone === "string" && data.sms_notify_phone.trim()
        ? data.sms_notify_phone.trim()
        : null,
    admin_shell_access: data.admin_shell_access !== false,
    page_access_preset: typeof data.page_access_preset === "string" ? data.page_access_preset : null,
    page_permissions: parsePagePermissions(data.page_permissions),
    require_password_change: data.require_password_change === true,
    phone_assignment_mode: assignMode,
    dedicated_outbound_e164:
      typeof data.dedicated_outbound_e164 === "string" ? data.dedicated_outbound_e164 : null,
    shared_line_e164: typeof data.shared_line_e164 === "string" ? data.shared_line_e164 : null,
    phone_calling_profile: phoneCalling,
    sms_messaging_enabled: data.sms_messaging_enabled !== false,
    voicemail_access_enabled: data.voicemail_access_enabled !== false,
    shared_line_permissions: parseSharedLinePerms(data.shared_line_permissions),
    softphone_mobile_enabled: data.softphone_mobile_enabled !== false,
    softphone_web_enabled: data.softphone_web_enabled !== false,
    push_notifications_enabled: data.push_notifications_enabled !== false,
    call_recording_enabled: data.call_recording_enabled === true,
  };
}

/**
 * Returns the staff profile for the current Supabase session user, or null if
 * unauthenticated or no matching row (including users who are not staff).
 */
async function loadStaffProfile(): Promise<StaffProfile | null> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("staff_profiles").select(STAFF_PROFILE_SELECT).eq("user_id", user.id).maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapStaffRow(data as Record<string, unknown>);
}

/** One `staff_profiles` fetch per request (layouts + page share the same result). */
export const getStaffProfile = cache(loadStaffProfile);

/**
 * Staff profile for `Authorization: Bearer <Supabase access JWT>` (e.g. React Native `fetch` without cookies).
 * Same row rules as {@link loadStaffProfile}; RLS applies when using the anon key + user JWT.
 */
export async function getStaffProfileUsingSupabaseUserJwt(accessToken: string): Promise<StaffProfile | null> {
  const token = accessToken.trim();
  if (!token) {
    return null;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase.from("staff_profiles").select(STAFF_PROFILE_SELECT).eq("user_id", user.id).maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapStaffRow(data as Record<string, unknown>);
}

/**
 * Workspace phone API routes: resolve staff without React `cache`, with optional `Authorization: Bearer`
 * (same as GET `/api/softphone/token`). Avoids rare stale cached `null` in Route Handlers when placing calls.
 */
export async function resolveStaffProfileForWorkspacePhoneApi(req: { headers: Headers }): Promise<StaffProfile | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const jwt = auth.slice(7).trim();
    if (jwt) {
      return getStaffProfileUsingSupabaseUserJwt(jwt);
    }
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("staff_profiles")
    .select(STAFF_PROFILE_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapStaffRow(data as Record<string, unknown>);
}
