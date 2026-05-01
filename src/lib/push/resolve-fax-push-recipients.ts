import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveEffectivePageAccess } from "@/lib/staff-page-access";
import type { StaffProfile, StaffRole } from "@/lib/staff-profile";

function asStaffRole(raw: unknown): StaffRole {
  const allowed: StaffRole[] = [
    "super_admin",
    "admin",
    "manager",
    "nurse",
    "don",
    "recruiter",
    "billing",
    "dispatch",
    "credentialing",
    "read_only",
  ];
  return typeof raw === "string" && (allowed as string[]).includes(raw) ? (raw as StaffRole) : "manager";
}

/**
 * Active staff logins that have Fax Center (`fax_center`) page access — push targets for inbound fax alerts.
 */
export async function resolveFaxCenterPushRecipientUserIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("user_id, role, page_access_preset, page_permissions, admin_shell_access")
    .eq("is_active", true)
    .not("user_id", "is", null);

  if (error) {
    console.warn("[push] resolveFaxCenterPushRecipientUserIds:", error.message);
    return [];
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (!uid || seen.has(uid)) continue;

    const pagePerms =
      row.page_permissions && typeof row.page_permissions === "object" && !Array.isArray(row.page_permissions)
        ? (row.page_permissions as Record<string, boolean>)
        : {};

    const stub: Pick<StaffProfile, "role" | "page_access_preset" | "page_permissions" | "admin_shell_access"> = {
      role: asStaffRole(row.role),
      page_access_preset: typeof row.page_access_preset === "string" ? row.page_access_preset : null,
      page_permissions: pagePerms,
      admin_shell_access: row.admin_shell_access === true,
    };

    const access = resolveEffectivePageAccess(stub);
    if (access.fax_center !== true) continue;

    seen.add(uid);
    out.push(uid);
  }

  return out;
}
