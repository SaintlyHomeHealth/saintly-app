import "server-only";

import { supabaseAdmin } from "@/lib/admin";

import type { InboundEmailChannelKey } from "./types";
import type { InboundEmailNormalized } from "./types";

export async function insertInboundCommunicationRow(input: {
  channel: InboundEmailChannelKey;
  normalized: InboundEmailNormalized;
  rawPayload: unknown;
  relatedLeadId?: string | null;
  relatedCandidateId?: string | null;
  parsedEntities?: Record<string, unknown> | null;
  reviewState?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string; code?: string }> {
  const n = input.normalized;
  const externalMessageId = n.messageId?.trim() || null;
  const { data, error } = await supabaseAdmin
    .from("inbound_communications")
    .insert({
      channel_type: "email",
      channel_key: input.channel,
      provider: n.provider,
      external_message_id: externalMessageId,
      from_email: n.fromEmail,
      from_name: n.fromName ?? null,
      to_emails: n.toEmails,
      cc_emails: n.ccEmails ?? [],
      subject: n.subject ?? null,
      text_body: n.textBody ?? null,
      html_body: n.htmlBody ?? null,
      raw_payload: input.rawPayload as object | null,
      parsed_entities: input.parsedEntities ?? null,
      related_lead_id: input.relatedLeadId ?? null,
      related_candidate_id: input.relatedCandidateId ?? null,
      review_state: input.reviewState ?? null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.warn("[inbound-email] insert inbound_communications:", error?.message);
    return { ok: false, error: error?.message ?? "insert_failed", code: error?.code };
  }
  return { ok: true, id: String(data.id) };
}

export async function inboundCommunicationExists(
  provider: string,
  externalMessageId: string
): Promise<boolean> {
  const p = provider.trim();
  const m = externalMessageId.trim();
  if (!p || !m) return false;
  const { data, error } = await supabaseAdmin
    .from("inbound_communications")
    .select("id")
    .eq("provider", p)
    .eq("external_message_id", m)
    .maybeSingle();
  if (error) {
    console.warn("[inbound-email] inboundCommunicationExists:", error.message);
    return false;
  }
  return Boolean(data?.id);
}
