import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { resolveInboundBrowserStaffUserIdsAsync } from "@/lib/softphone/inbound-staff-ids";

const LOG = "[push] new-lead";

const OPEN_PATH = "/workspace/phone/leads";

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

    const result = await sendFcmDataAndNotificationToUserIds(supabase, userIds, {
      title: "New lead",
      body,
      data: {
        type: "new_lead",
        lead_id: id,
        open_path: OPEN_PATH,
        ...(source ? { source } : {}),
      },
      apnsCollapseId: `lead-${id}`,
    });

    if (!result.ok) {
      console.warn(LOG, "notify failed", { leadId: id, error: result.error });
    } else {
      console.log(LOG, "notify complete", {
        leadId: id,
        recipientUserCount: userIds.length,
        sent: result.sent,
        failureCount: result.failureCount,
        invalidTokenRemovalCount: result.invalidTokenRemovalCount,
        errors: result.errors,
      });
    }
  } catch (e) {
    console.warn(LOG, "notify exception", e);
  }
}
