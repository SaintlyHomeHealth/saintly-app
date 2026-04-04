import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type TwilioMessageStatusParams = Record<string, string>;

type TwilioDeliveryMeta = {
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
  from?: string | null;
  to?: string | null;
};

/**
 * Applies Twilio Messaging status webhook payload to the matching `messages` row
 * (`external_message_sid` = MessageSid). Merges into `metadata.twilio_delivery`.
 */
export async function applyTwilioOutboundMessageStatus(
  supabase: SupabaseClient,
  params: TwilioMessageStatusParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const messageSid = (params.MessageSid ?? params.SmsSid ?? "").trim();
  const messageStatus = (params.MessageStatus ?? params.SmsStatus ?? "").trim().toLowerCase();
  const errorCode = typeof params.ErrorCode === "string" ? params.ErrorCode.trim() : "";
  const errorMessage = typeof params.ErrorMessage === "string" ? params.ErrorMessage.trim() : "";

  if (!messageSid) {
    return { ok: false, error: "missing MessageSid" };
  }

  const { data: row, error: selErr } = await supabase
    .from("messages")
    .select("id, metadata")
    .eq("external_message_sid", messageSid)
    .maybeSingle();

  if (selErr) {
    return { ok: false, error: selErr.message };
  }

  if (!row?.id) {
    console.warn("[sms-status] no messages row for MessageSid (ok to ignore if not our outbound)", {
      messageSid,
      messageStatus: messageStatus || "(empty)",
    });
    return { ok: true };
  }

  const prevMeta =
    row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? ({ ...row.metadata } as Record<string, unknown>)
      : {};
  const prevDelivery = prevMeta.twilio_delivery as TwilioDeliveryMeta | undefined;
  const prevStatus = typeof prevDelivery?.status === "string" ? prevDelivery.status : null;

  const nextDelivery: TwilioDeliveryMeta = {
    status: messageStatus || null,
    error_code: errorCode || null,
    error_message: errorMessage || null,
    updated_at: new Date().toISOString(),
    from: typeof params.From === "string" ? params.From.trim() : null,
    to: typeof params.To === "string" ? params.To.trim() : null,
  };

  const nextMeta = {
    ...prevMeta,
    twilio_delivery: nextDelivery,
  };

  console.log("[sms-status] transition", {
    messageSid,
    messageId: row.id,
    fromStatus: prevStatus,
    toStatus: nextDelivery.status,
    errorCode: nextDelivery.error_code || undefined,
  });

  const { error: upErr } = await supabase
    .from("messages")
    .update({ metadata: nextMeta })
    .eq("id", row.id)
    .eq("external_message_sid", messageSid);

  if (upErr) {
    console.warn("[sms-status] update failed", upErr.message);
    return { ok: false, error: upErr.message };
  }

  return { ok: true };
}
