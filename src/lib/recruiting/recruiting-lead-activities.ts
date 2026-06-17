import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const RECRUITING_LEAD_ACTIVITY_EVENT = {
  outbound_email: "outbound_email",
  outbound_email_failed: "outbound_email_failed",
  admin_sms_alert: "admin_sms_alert",
} as const;

export type RecruitingLeadOutboundEmailMetadata = {
  template_id?: string | null;
  subject: string;
  body: string;
  recipient: string;
  sent_at: string;
  sent_by: string | null;
  sent_by_name?: string | null;
  delivery_status: "sent" | "failed" | "rejected";
  provider_message_id?: string | null;
  error?: string | null;
};

export async function insertRecruitingLeadActivity(
  supabase: SupabaseClient,
  input: {
    leadId: string;
    eventType: string;
    body: string | null;
    metadata: Record<string, unknown>;
    createdBy: string | null;
  }
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("facebook_recruiting_lead_activities")
    .insert({
      lead_id: input.leadId,
      event_type: input.eventType,
      body: input.body,
      metadata: input.metadata,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { ok: false, error: error?.message ?? "activity_insert_failed" };
  }

  return { ok: true, id: String(data.id) };
}
