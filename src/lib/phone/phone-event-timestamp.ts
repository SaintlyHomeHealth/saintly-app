import { APP_TIME_ZONE } from "@/lib/datetime/app-timezone";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";

export type PhoneTimestampSource =
  | "message.created_at"
  | "sms.twilio_delivery.updated_at"
  | "phone_call.started_at"
  | "phone_call.voicemail_received_at"
  | "phone_call.ended_at"
  | "phone_call_event.created_at"
  | "phone_call.created_at"
  | "lead_activity.occurred_at"
  | "lead_activity.created_at";

export type PhoneCallTimestampInput = {
  started_at?: unknown;
  voicemail_received_at?: unknown;
  ended_at?: unknown;
  created_at?: unknown;
  /** Earliest related phone_call_events.created_at (when available server-side). */
  earliest_event_at?: unknown;
  has_voicemail?: unknown;
  status?: unknown;
  voicemail_recording_sid?: unknown;
};

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

/**
 * Best actual call event time for display/sort.
 * Never uses updated_at.
 */
export function resolvePhoneCallDisplayIso(
  input: PhoneCallTimestampInput
): { iso: string | null; source: PhoneTimestampSource | null } {
  const chain: Array<{ iso: string | null; source: PhoneTimestampSource }> = [
    { iso: parseIso(input.started_at), source: "phone_call.started_at" },
    { iso: parseIso(input.voicemail_received_at), source: "phone_call.voicemail_received_at" },
    { iso: parseIso(input.ended_at), source: "phone_call.ended_at" },
    { iso: parseIso(input.earliest_event_at), source: "phone_call_event.created_at" },
    { iso: parseIso(input.created_at), source: "phone_call.created_at" },
  ];

  for (const item of chain) {
    if (item.iso) {
      return { iso: item.iso, source: item.source };
    }
  }

  return { iso: null, source: null };
}

export function comparePhoneCallDisplayTimeDesc(
  a: PhoneCallTimestampInput,
  b: PhoneCallTimestampInput
): number {
  const ai = resolvePhoneCallDisplayIso(a).iso;
  const bi = resolvePhoneCallDisplayIso(b).iso;
  const at = ai ? new Date(ai).getTime() : 0;
  const bt = bi ? new Date(bi).getTime() : 0;
  const aOk = Number.isFinite(at) ? at : 0;
  const bOk = Number.isFinite(bt) ? bt : 0;
  return bOk - aOk;
}

export function sortRowsByPhoneCallDisplayTimeDesc<T>(
  rows: T[],
  pick: (row: T) => PhoneCallTimestampInput
): T[] {
  return [...rows].sort((a, b) => comparePhoneCallDisplayTimeDesc(pick(a), pick(b)));
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

/** Debug one call-log row (workspace/admin lists). */
export function logPhoneCallListRowTimestampDebug(
  row: PhoneCallTimestampInput & {
    id?: string | null;
    external_call_id?: string | null;
    updated_at?: unknown;
  },
  context: string
): void {
  if (process.env.WORKSPACE_CALLS_DEBUG !== "1" && process.env.PHONE_TIMESTAMP_DEBUG !== "1") {
    return;
  }
  const resolved = resolvePhoneCallDisplayIso(row);
  const formattedArizona = formatAdminPhoneWhen(resolved.iso);
  console.log("[phone-call-list-timestamp]", {
    context,
    phone_call_id: row.id ?? null,
    call_sid: row.external_call_id ?? null,
    raw_created_at: row.created_at ?? null,
    raw_updated_at: row.updated_at ?? null,
    raw_started_at: row.started_at ?? null,
    raw_ended_at: row.ended_at ?? null,
    raw_voicemail_received_at: row.voicemail_received_at ?? null,
    raw_earliest_event_at: row.earliest_event_at ?? null,
    selected_display_timestamp: resolved.iso,
    selected_source: resolved.source,
    formatted_arizona: formattedArizona,
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
