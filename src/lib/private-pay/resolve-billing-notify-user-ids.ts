import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveEffectivePageAccess, type StaffForPageAccess } from "@/lib/staff-page-access";
import { isManagerOrHigher, type StaffProfile, type StaffRole } from "@/lib/staff-profile";

const LOG = "[private-pay-notify]";

type StaffNotifyRow = StaffForPageAccess & {
  user_id: string;
  role: StaffRole;
  is_active: boolean | null;
};

function staffProfileFromRow(row: StaffNotifyRow): StaffProfile {
  return {
    id: "",
    user_id: row.user_id,
    email: null,
    role: row.role,
    created_at: "",
    updated_at: "",
    full_name: null,
    is_active: row.is_active !== false,
    phone_access_enabled: false,
    inbound_ring_enabled: false,
    applicant_id: null,
    sms_notify_phone: null,
    admin_shell_access: true,
    page_access_preset: row.page_access_preset ?? null,
    page_permissions: row.page_permissions ?? {},
    require_password_change: false,
    phone_assignment_mode: "organization_default",
    dedicated_outbound_e164: null,
    shared_line_e164: null,
    phone_calling_profile: "inbound_outbound",
    sms_messaging_enabled: true,
    voicemail_access_enabled: true,
    shared_line_permissions: {},
    softphone_mobile_enabled: true,
    softphone_web_enabled: true,
    push_notifications_enabled: true,
    call_recording_enabled: false,
  };
}

/** Staff with billing access who should receive private-pay payment alerts. */
export async function resolveBillingNotifyUserIds(supabase: SupabaseClient): Promise<string[]> {
  const { data: rows, error } = await supabase
    .from("staff_profiles")
    .select("user_id, role, page_access_preset, page_permissions, admin_shell_access, is_active")
    .eq("is_active", true);

  if (error) {
    console.warn(LOG, "staff_load_failed", { error: error.message });
    return [];
  }

  const out: string[] = [];
  for (const raw of rows ?? []) {
    const row = raw as StaffNotifyRow;
    const userId = row.user_id?.trim();
    if (!userId) continue;
    if (row.role === "sales_agent") continue;
    if (!isManagerOrHigher(staffProfileFromRow(row))) continue;

    const access = resolveEffectivePageAccess(row);
    if (access.billing !== true) continue;

    out.push(userId);
  }

  return [...new Set(out)];
}
