import { APP_TIME_ZONE } from "@/lib/datetime/app-timezone";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";

export type PhoneTimestampSource =
  | "message.created_at"
  | "sms.twilio_delivery.updated_at"
  | "phone_call.started_at"
  | "phone_call.voicemail_received_at"
  | "phone_call.created_at"
  | "lead_activity.occurred_at"
  | "lead_activity.created_at";

function parseIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function resolvePhoneCallDisplayIso(input: {
  started_at?: unknown;
  voicemail_received_at?: unknown;
  ended_at?: unknown;
  created_at?: unknown;
  has_voicemail?: unknown;
  status?: unknown;
  voicemail_recording_sid?: unknown;
}): { iso: string | null; source: PhoneTimestampSource | null } {
  const st = String(input.status ?? "").trim().toLowerCase();
  const hasVm =
    input.has_voicemail === true ||
    st === "voicemail" ||
    (typeof input.voicemail_recording_sid === "string" && input.voicemail_recording_sid.trim() !== "");

  if (hasVm) {
    const vm = parseIso(input.voicemail_received_at) ?? parseIso(input.started_at);
    if (vm) {
      return {
        iso: vm,
        source: parseIso(input.voicemail_received_at)
          ? "phone_call.voicemail_received_at"
          : "phone_call.started_at",
      };
    }
  }

  const started = parseIso(input.started_at);
  if (started) return { iso: started, source: "phone_call.started_at" };

  const created = parseIso(input.created_at);
  if (created) return { iso: created, source: "phone_call.created_at" };

  return { iso: null, source: null };
}

export function resolveSmsMessageDisplayIso(input: {
  created_at?: unknown;
  metadata?: unknown;
  message_type?: unknown;
  phoneCall?: {
    started_at?: unknown;
    voicemail_received_at?: unknown;
    created_at?: unknown;
    has_voicemail?: unknown;
    status?: unknown;
    voicemail_recording_sid?: unknown;
  } | null;
}): { iso: string | null; source: PhoneTimestampSource | null } {
  const mt = String(input.message_type ?? "").trim().toLowerCase();
  if (mt === "voicemail" && input.phoneCall) {
    const fromCall = resolvePhoneCallDisplayIso(input.phoneCall);
    if (fromCall.iso) return fromCall;
  }

  const meta = asMeta(input.metadata);
  const delivery = meta.twilio_delivery;
  if (delivery && typeof delivery === "object" && !Array.isArray(delivery)) {
    const updated = parseIso((delivery as Record<string, unknown>).updated_at);
    if (updated) return { iso: updated, source: "sms.twilio_delivery.updated_at" };
  }

  const created = parseIso(input.created_at);
  if (created) return { iso: created, source: "message.created_at" };

  return { iso: null, source: null };
}

export function resolveLeadActivityDisplayIso(input: {
  created_at?: unknown;
  metadata?: unknown;
}): { iso: string | null; source: PhoneTimestampSource | null } {
  const meta = asMeta(input.metadata);
  const occurred = parseIso(meta.occurred_at);
  if (occurred) return { iso: occurred, source: "lead_activity.occurred_at" };

  const created = parseIso(input.created_at);
  if (created) return { iso: created, source: "lead_activity.created_at" };

  return { iso: null, source: null };
}

export function logPhoneTimestampDebug(input: {
  context: string;
  rawDbTimestamp?: string | null;
  selectedDisplayTimestamp?: string | null;
  source?: PhoneTimestampSource | null;
  formattedArizona?: string;
}): void {
  if (process.env.PHONE_TIMESTAMP_DEBUG !== "1") return;
  console.log("[phone-timestamp]", {
    context: input.context,
    rawDbTimestamp: input.rawDbTimestamp ?? null,
    selectedDisplayTimestamp: input.selectedDisplayTimestamp ?? null,
    formattedArizona: input.formattedArizona ?? null,
    source: input.source ?? null,
    timezone: APP_TIME_ZONE,
  });
}

export function formatPhoneEventWhen(
  iso: string | null,
  debug?: {
    context: string;
    rawDbTimestamp?: string | null;
    source?: PhoneTimestampSource | null;
  }
): string {
  const formatted = formatAdminPhoneWhen(iso);
  if (debug) {
    logPhoneTimestampDebug({
      context: debug.context,
      rawDbTimestamp: debug.rawDbTimestamp ?? iso,
      selectedDisplayTimestamp: iso,
      source: debug.source ?? null,
      formattedArizona: formatted,
    });
  }
  return formatted;
}

/** Parse Twilio webhook `Timestamp` (RFC2822) to UTC ISO. */
export function parseTwilioWebhookTimestamp(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
