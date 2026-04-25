/**
 * Outbound SMS delivery labels from Twilio (and compatible provider) status values.
 *
 * Data sources (first match wins):
 * - `messages.metadata.twilio_delivery.status` (written on send + updated by
 *   `applyTwilioOutboundMessageStatus` when Twilio hits POST `/api/twilio/sms/status`)
 * - Top-level columns on the row if present: `status`, `twilio_status`, `delivery_status`, `provider_status`
 *
 * Standard SMS/MMS has no true read receipts in Twilio; we never show the word "Read".
 * If the provider ever sends `read`, we display "Delivered" instead.
 */

export type SmsTwilioDeliveryMeta = {
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
  from?: string | null;
  to?: string | null;
};

export function buildInitialTwilioDeliveryFromRestResponse(params: {
  twilioStatus: string | null;
  updatedAtIso: string;
  /** E.164 we sent as `From` (omit when using Messaging Service `MG…` — real From arrives via status callback). */
  fromE164?: string | null;
  /** Recipient E.164 (optional, stored for audit / support). */
  toE164?: string | null;
}): SmsTwilioDeliveryMeta {
  const s = params.twilioStatus?.trim();
  const from =
    params.fromE164 != null && String(params.fromE164).trim() !== "" ? String(params.fromE164).trim() : undefined;
  const to =
    params.toE164 != null && String(params.toE164).trim() !== "" ? String(params.toE164).trim() : undefined;
  return {
    status: s ? s.toLowerCase() : null,
    error_code: null,
    error_message: null,
    updated_at: params.updatedAtIso,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

type Rowish = {
  metadata?: unknown;
  status?: unknown;
  twilio_status?: unknown;
  delivery_status?: unknown;
  provider_status?: unknown;
};

/** Lowercase provider status, or null if unknown / absent. */
export function extractSmsProviderStatusRaw(row: Rowish): string | null {
  const top =
    (typeof row.status === "string" && row.status.trim() && row.status) ||
    (typeof row.twilio_status === "string" && row.twilio_status.trim() && row.twilio_status) ||
    (typeof row.delivery_status === "string" && row.delivery_status.trim() && row.delivery_status) ||
    (typeof row.provider_status === "string" && row.provider_status.trim() && row.provider_status) ||
    "";
  if (top) return String(top).trim().toLowerCase();

  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const o = meta as Record<string, unknown>;
    const td = o.twilio_delivery;
    if (td && typeof td === "object" && !Array.isArray(td)) {
      const st = (td as Record<string, unknown>).status;
      if (typeof st === "string" && st.trim()) return st.trim().toLowerCase();
    }
  }
  return null;
}

/**
 * Human-readable line for outbound bubbles (not used for inbound).
 * `raw` is from `extractSmsProviderStatusRaw`.
 */
export function formatSmsOutboundDeliveryLabel(
  raw: string | null,
  opts: { isOptimistic: boolean }
): string {
  if (opts.isOptimistic) return "Sending…";

  if (raw == null || raw === "") {
    return "Sent";
  }

  const s = raw.toLowerCase().trim();
  if (
    s === "pending" ||
    s === "queued" ||
    s === "accepted" ||
    s === "scheduled" ||
    s === "sending" ||
    s === "receiving"
  ) {
    return "Sending…";
  }
  if (s === "sent") return "Sent";
  if (s === "delivered" || s === "partially_delivered" || s === "read") return "Delivered";
  if (s === "undelivered") return "Undelivered";
  if (s === "failed" || s === "canceled" || s === "cancelled") return "Failed";

  return "Sent";
}
