import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { resolveInboundBrowserStaffUserIdsAsync } from "@/lib/softphone/inbound-staff-ids";
import { isManagerOrHigher, type StaffProfile } from "@/lib/staff-profile";

const LOG = "[push] new-lead";

const OPEN_PATH_WORKSPACE_LEADS_LIST = "/workspace/phone/leads";

function staffProfileStubForRole(role: string): StaffProfile {
  return {
    id: "",
    user_id: "",
    email: null,
    role: role as StaffProfile["role"],
    created_at: "",
    updated_at: "",
    full_name: null,
    is_active: true,
    phone_access_enabled: false,
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

function normalizeContactEmb(
  raw: unknown
): {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_phone: string | null;
} | null {
  if (Array.isArray(raw)) {
    return normalizeContactEmb(raw[0]);
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? o[k] : null);
  return {
    full_name: str("full_name"),
    first_name: str("first_name"),
    last_name: str("last_name"),
    primary_phone: str("primary_phone"),
  };
}

function buildNewLeadNotificationBody(
  contact: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    primary_phone?: string | null;
  } | null,
  source: string | null | undefined
): string {
  const c = contact ?? {};
  const name =
    (typeof c.full_name === "string" ? c.full_name : "").trim() ||
    [c.first_name, c.last_name]
      .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
      .join(" ")
      .trim();
  if (name) {
    return name.length > 180 ? `${name.slice(0, 179)}…` : name;
  }

  const src = (typeof source === "string" ? source : "").trim() || "Lead";
  const phone = (typeof c.primary_phone === "string" ? c.primary_phone : "").trim();
  if (phone) {
    const line = `${src} · ${phone}`;
    return line.length > 180 ? `${line.slice(0, 179)}…` : line;
  }

  return "A new lead was created";
}

/**
 * Fan-out to the same staff audience as inbound phone / SMS push (env + eligible staff_profiles).
 * Idempotent retries: same `leadId` reuses `apns-collapse-id` lead-{uuid} so duplicate sends replace one alert.
 */
export async function notifyNewLeadCreatedPush(supabase: SupabaseClient, leadId: string): Promise<void> {
  if (process.env.SAINTLY_PUSH_NEW_LEAD_DISABLED === "1") {
    console.log(LOG, "skipped", { reason: "SAINTLY_PUSH_NEW_LEAD_DISABLED", leadId: leadId.trim() });
    return;
  }

  const id = leadId.trim();
  if (!id) {
    console.warn(LOG, "skipped", { reason: "empty_lead_id" });
    return;
  }

  try {
    const { data: row, error } = await supabase
      .from("leads")
      .select("id, source, contacts ( full_name, first_name, last_name, primary_phone )")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.warn(LOG, "load failed", { leadId: id, error: error.message });
      return;
    }
    if (!row?.id) {
      console.warn(LOG, "skipped", { reason: "lead_not_found", leadId: id });
      return;
    }

    const source = typeof row.source === "string" ? row.source : null;
    const contact = normalizeContactEmb(
      (row as { contacts?: unknown }).contacts
    );

    const body = buildNewLeadNotificationBody(contact, source);
    const userIds = await resolveInboundBrowserStaffUserIdsAsync();
    if (userIds.length === 0) {
      console.log(LOG, "skipped", { reason: "no_recipient_user_ids", leadId: id });
      return;
    }

    const { data: roleRows } = await supabase
      .from("staff_profiles")
      .select("user_id, role")
      .in("user_id", userIds);

    const roleByUserId = new Map<string, string>();
    for (const r of roleRows ?? []) {
      const uid = typeof r.user_id === "string" ? r.user_id : "";
      const role = typeof r.role === "string" ? r.role : "";
      if (uid && role) roleByUserId.set(uid, role);
    }

    const managerUserIds: string[] = [];
    const nonManagerUserIds: string[] = [];
    for (const uid of userIds) {
      const role = roleByUserId.get(uid);
      if (role && isManagerOrHigher(staffProfileStubForRole(role))) {
        managerUserIds.push(uid);
      } else {
        nonManagerUserIds.push(uid);
      }
    }

    const baseData = (openPath: string) =>
      ({
        type: "new_lead",
        lead_id: id,
        open_path: openPath,
        ...(source ? { source } : {}),
      }) as Record<string, string>;

    const sendOne = async (recipients: string[], openPath: string) => {
      if (recipients.length === 0) return null;
      return sendFcmDataAndNotificationToUserIds(supabase, recipients, {
        title: "New lead",
        body,
        data: baseData(openPath),
        apnsCollapseId: `lead-${id}`,
      });
    };

    /** Managers+ → admin lead detail. Others → workspace leads list (middleware blocks `/admin/*` for nurse/workspace-only roles). */
    const [mgrResult, otherResult] = await Promise.all([
      sendOne(managerUserIds, `/admin/crm/leads/${id}`),
      sendOne(nonManagerUserIds, OPEN_PATH_WORKSPACE_LEADS_LIST),
    ]);

    const mergedOk =
      (mgrResult === null || mgrResult.ok) && (otherResult === null || otherResult.ok);
    if (!mergedOk) {
      console.warn(LOG, "notify failed", {
        leadId: id,
        managerError: mgrResult && !mgrResult.ok ? mgrResult.error : undefined,
        otherError: otherResult && !otherResult.ok ? otherResult.error : undefined,
      });
    } else {
      const sent = (mgrResult?.sent ?? 0) + (otherResult?.sent ?? 0);
      const failureCount = (mgrResult?.failureCount ?? 0) + (otherResult?.failureCount ?? 0);
      const invalidTokenRemovalCount =
        (mgrResult?.invalidTokenRemovalCount ?? 0) + (otherResult?.invalidTokenRemovalCount ?? 0);
      console.log(LOG, "notify complete", {
        leadId: id,
        recipientUserCount: userIds.length,
        managerRecipientCount: managerUserIds.length,
        nonManagerRecipientCount: nonManagerUserIds.length,
        sent,
        failureCount,
        invalidTokenRemovalCount,
      });
    }
  } catch (e) {
    console.warn(LOG, "notify exception", e);
  }
}
