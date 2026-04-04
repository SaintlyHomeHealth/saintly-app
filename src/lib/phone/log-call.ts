import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  tryInsertMissedCallNotification,
  tryInsertVoicemailNotification,
} from "@/lib/phone/call-notifications";
import {
  resolveIncomingCallAlertIfNeeded,
  syncIncomingCallAlertFromPhoneStatus,
} from "@/lib/phone/incoming-call-alerts";
import { triggerAutoFollowUp } from "@/lib/phone/auto-followup";
import { normalizeTwilioRecordingMediaUrl } from "@/lib/phone/twilio-recording-media";
import { scheduleSaintlyVoicemailProcessing } from "@/lib/phone/voicemail-saintly-process";
import { awaitVoiceAiClassificationForWebhook } from "@/lib/phone/voice-ai-background";

export const PHONE_CALL_STATUSES = [
  "unknown",
  "initiated",
  "ringing",
  "in_progress",
  "completed",
  "missed",
  "abandoned",
  "failed",
  "cancelled",
] as const;

export type PhoneCallStatus = (typeof PHONE_CALL_STATUSES)[number];

function isPhoneCallStatus(value: unknown): value is PhoneCallStatus {
  return typeof value === "string" && (PHONE_CALL_STATUSES as readonly string[]).includes(value);
}

export type PhoneWebhookBody = {
  external_call_id?: unknown;
  direction?: unknown;
  from_e164?: unknown;
  to_e164?: unknown;
  status?: unknown;
  started_at?: unknown;
  ended_at?: unknown;
  duration_seconds?: unknown;
  metadata?: unknown;
  /** Logged as a phone_call_events row alongside the upsert. */
  event_type?: unknown;
  /** Spread into the event row payload alongside `intake`. */
  event_payload?: unknown;
};

function asOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

function asOptionalIsoTime(value: unknown): string | null {
  const s = asOptionalString(value);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function asOptionalInt(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Upsert phone_calls by external_call_id and append one phone_call_events row.
 * Merges onto an existing row so partial provider payloads do not wipe From/To.
 */
export async function upsertPhoneCallFromWebhook(
  supabase: SupabaseClient,
  body: PhoneWebhookBody
): Promise<{ ok: true; callId: string } | { ok: false; error: string }> {
  const externalCallId = asOptionalString(body.external_call_id);
  if (!externalCallId) {
    return { ok: false, error: "external_call_id is required" };
  }

  const directionExplicit = typeof body.direction === "string" && body.direction.trim() !== "";
  const direction =
    asOptionalString(body.direction) === "outbound" ? "outbound" : "inbound";

  const nextStatus: PhoneCallStatus = isPhoneCallStatus(body.status) ? body.status : "unknown";

  const fromVal = asOptionalString(body.from_e164);
  const toVal = asOptionalString(body.to_e164);
  const startedVal = asOptionalIsoTime(body.started_at);
  const endedVal = asOptionalIsoTime(body.ended_at);
  const durationVal = asOptionalInt(body.duration_seconds);
  const metaVal = body.metadata !== undefined ? asMetadata(body.metadata) : undefined;

  const { data: existing, error: findError } = await supabase
    .from("phone_calls")
    .select("id")
    .eq("external_call_id", externalCallId)
    .maybeSingle();

  if (findError) {
    return { ok: false, error: findError.message };
  }

  let callId: string;

  if (!existing?.id) {
    const insertRow = {
      external_call_id: externalCallId,
      direction,
      from_e164: fromVal,
      to_e164: toVal,
      status: nextStatus,
      started_at: startedVal,
      ended_at: endedVal,
      duration_seconds: durationVal,
      metadata: metaVal ?? {},
    };

    const { data: inserted, error: insertError } = await supabase
      .from("phone_calls")
      .insert(insertRow)
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      return { ok: false, error: insertError?.message ?? "Failed to insert phone_calls row" };
    }
    callId = inserted.id as string;
  } else {
    callId = existing.id as string;
    const updateRow: Record<string, unknown> = {};

    if (directionExplicit) {
      updateRow.direction = direction;
    }

    if (isPhoneCallStatus(body.status)) {
      updateRow.status = nextStatus;
    }

    if (fromVal !== null) updateRow.from_e164 = fromVal;
    if (toVal !== null) updateRow.to_e164 = toVal;
    if (startedVal !== null) updateRow.started_at = startedVal;
    if (endedVal !== null) updateRow.ended_at = endedVal;
    if (durationVal !== null) updateRow.duration_seconds = durationVal;
    if (metaVal !== undefined) updateRow.metadata = metaVal;

    if (Object.keys(updateRow).length > 0) {
      const { error: updateError } = await supabase.from("phone_calls").update(updateRow).eq("id", callId);

      if (updateError) {
        return { ok: false, error: updateError.message };
      }
    }
  }

  const { data: crmCallRow, error: crmCallRowErr } = await supabaseAdmin
    .from("phone_calls")
    .select("from_e164, contact_id")
    .eq("id", callId)
    .maybeSingle();

  if (!crmCallRowErr && crmCallRow) {
    const fromE164 = fromVal ?? asOptionalString(crmCallRow.from_e164);
    const hasContactId =
      crmCallRow.contact_id != null && String(crmCallRow.contact_id).trim() !== "";
    if (direction === "inbound" && !hasContactId && fromE164) {
      const { data: contact, error: contactErr } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .or(`primary_phone.eq.${fromE164},secondary_phone.eq.${fromE164}`)
        .limit(1)
        .maybeSingle();

      if (contactErr) {
        console.warn("[phone_calls] CRM contact lookup:", contactErr.message);
      } else if (contact?.id) {
        const { error: linkErr } = await supabaseAdmin
          .from("phone_calls")
          .update({ contact_id: contact.id })
          .eq("id", callId)
          .is("contact_id", null);

        if (linkErr) {
          console.warn("[phone_calls] link contact_id:", linkErr.message);
        }
      }
    }
  }

  const eventType = asOptionalString(body.event_type) ?? "webhook.intake";
  const eventPayload = {
    ...asMetadata(body.event_payload),
    intake: {
      ...(isPhoneCallStatus(body.status) ? { status: nextStatus } : {}),
      ...(directionExplicit ? { direction } : {}),
    },
  };

  const { error: eventError } = await supabase.from("phone_call_events").insert({
    call_id: callId,
    event_type: eventType,
    payload: eventPayload,
  });

  if (eventError) {
    return { ok: false, error: eventError.message };
  }

  if (isTerminalPhoneStatus(nextStatus)) {
    await awaitVoiceAiClassificationForWebhook(callId);
  }

  return { ok: true, callId };
}

/**
 * Append an event when the call already exists (external_call_id from provider).
 */
export async function appendPhoneCallEventByExternalId(
  supabase: SupabaseClient,
  externalCallId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<{ ok: true; callId: string } | { ok: false; error: string }> {
  const { data: callRow, error: findError } = await supabase
    .from("phone_calls")
    .select("id")
    .eq("external_call_id", externalCallId)
    .maybeSingle();

  if (findError) {
    return { ok: false, error: findError.message };
  }
  if (!callRow?.id) {
    return { ok: false, error: "Call not found for external_call_id" };
  }

  const callId = callRow.id as string;
  const { error: insertError } = await supabase.from("phone_call_events").insert({
    call_id: callId,
    event_type: eventType,
    payload,
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return { ok: true, callId };
}

function normalizeTwilioToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Twilio AMD / Dial may include AnsweredBy (e.g. when machineDetection is enabled on &lt;Number&gt;).
 * When present, machine/fax completions are treated as missed for Saintly (not a live staff pickup).
 */
function isDialLegMachineOrFaxAnsweredBy(answeredBy: string | null | undefined): boolean {
  const a = (answeredBy ?? "").trim().toLowerCase();
  if (!a) return false;
  if (a.startsWith("machine")) return true;
  if (a === "fax") return true;
  return false;
}

/**
 * Map Twilio CallStatus / DialCallStatus to our phone_calls.status.
 * Dial leg outcomes take precedence when DialCallStatus is present (forward attempt).
 */
export function mapTwilioStatusToPhoneStatus(input: {
  callStatus: string;
  dialCallStatus?: string | null;
  /** From status callback AnsweredBy when AMD is enabled on the dialed leg. */
  answeredBy?: string | null;
}): PhoneCallStatus {
  const dialRaw = input.dialCallStatus?.trim();
  if (dialRaw) {
    const d = normalizeTwilioToken(dialRaw);
    switch (d) {
      case "completed":
        if (isDialLegMachineOrFaxAnsweredBy(input.answeredBy)) {
          return "missed";
        }
        return "completed";
      case "answered":
        return "in_progress";
      case "ringing":
      case "initiated":
        return "ringing";
      case "busy":
      case "no-answer":
        return "missed";
      case "failed":
        return "failed";
      case "canceled":
      case "cancelled":
        return "cancelled";
      default:
        break;
    }
  }

  const c = normalizeTwilioToken(input.callStatus);
  switch (c) {
    case "completed":
      return "completed";
    case "in-progress":
      return "in_progress";
    case "ringing":
      return "ringing";
    case "queued":
      return "ringing";
    case "busy":
    case "no-answer":
      return "missed";
    case "failed":
      return "failed";
    case "canceled":
    case "cancelled":
      return "cancelled";
    default:
      return "unknown";
  }
}

export function isTerminalPhoneStatus(status: PhoneCallStatus): boolean {
  return (
    status === "completed" ||
    status === "missed" ||
    status === "abandoned" ||
    status === "failed" ||
    status === "cancelled"
  );
}

/**
 * First eligible staff profile (admin / super_admin / manager). Does not override existing assignment.
 */
async function maybeAutoAssignMissedInboundCall(
  callId: string,
  direction: string,
  hadAssignee: boolean
): Promise<void> {
  if (direction !== "inbound" || hadAssignee) {
    return;
  }

  const { data: staffRow, error: staffErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email")
    .in("role", ["admin", "super_admin", "manager"])
    .order("email", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (staffErr) {
    console.warn("[phone_calls] auto_assign_missed staff_profiles:", staffErr.message);
    return;
  }

  const uid = staffRow?.user_id;
  if (typeof uid !== "string" || !uid) {
    return;
  }

  const em = typeof staffRow.email === "string" ? staffRow.email.trim() : "";
  const label = em ? em : `User ${uid.slice(0, 8)}…`;
  const now = new Date().toISOString();

  const { error: updErr } = await supabaseAdmin
    .from("phone_calls")
    .update({
      assigned_to_user_id: uid,
      assigned_at: now,
      assigned_to_label: label,
    })
    .eq("id", callId)
    .is("assigned_to_user_id", null);

  if (updErr) {
    console.warn("[phone_calls] auto_assign_missed phone_calls:", updErr.message);
  }
}

/**
 * Twilio often sends `completed` for inbound hangups that never bridged (greeting, ring, carrier VM without VM row yet).
 * Uses effective duration, prior row status, voicemail sid, AMD AnsweredBy.
 */
const SHORT_ABANDONED_MAX_DURATION_SECONDS = 8;

function parseDurationSecondsFromTwilioRaw(raw: Record<string, string>): number | null {
  for (const key of ["CallDuration", "Duration", "DialCallDuration"]) {
    const v = raw[key]?.trim();
    if (v != null && v !== "") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return null;
}

function resolveEffectiveCallDurationSeconds(
  fromPayload: number | null,
  fromRow: number | null,
  raw: Record<string, string>
): number | null {
  if (fromPayload != null) return fromPayload;
  if (fromRow != null) return fromRow;
  return parseDurationSecondsFromTwilioRaw(raw);
}

function refineInboundTwilioCompletedStatus(
  mapped: PhoneCallStatus,
  input: {
    direction: string;
    voicemailRecordingSid: string | null;
    durationSeconds: number | null;
    /** DB status before this callback — in_progress means the call had bridged (staff/callee picked up). */
    previousPhoneStatus: string | null;
    /** AMD: keep completed when Twilio says a human answered. */
    answeredBy: string | null;
  }
): PhoneCallStatus {
  if (mapped !== "completed") return mapped;
  if (input.direction !== "inbound") return mapped;
  if (input.voicemailRecordingSid && input.voicemailRecordingSid.trim() !== "") return mapped;
  const prev = (input.previousPhoneStatus ?? "").trim().toLowerCase();
  if (prev === "in_progress") return mapped;
  const ab = (input.answeredBy ?? "").trim().toLowerCase();
  if (ab === "human") return mapped;
  const d = input.durationSeconds;
  if (d == null || !Number.isFinite(d) || d < 0) return mapped;
  if (d <= SHORT_ABANDONED_MAX_DURATION_SECONDS) return "abandoned";
  return "missed";
}

export type TwilioAmdStatusPayload = {
  parentCallSid: string;
  answeredBy: string | null;
  childCallSid: string | null;
  machineDetectionDurationMs: number | null;
  raw: Record<string, string>;
};

/**
 * Persist Twilio amdStatusCallback on the parent inbound leg (ParentCallSid → phone_calls.external_call_id).
 * Status transitions still come from applyTwilioVoiceStatusCallback; this is for ops/debug only.
 */
export async function applyTwilioAmdStatusCallback(
  supabase: SupabaseClient,
  payload: TwilioAmdStatusPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parent = payload.parentCallSid.trim();
  if (!parent) {
    return { ok: false, error: "parentCallSid is required" };
  }

  const { data: row, error: findError } = await supabase
    .from("phone_calls")
    .select("id, metadata")
    .eq("external_call_id", parent)
    .maybeSingle();

  if (findError) {
    return { ok: false, error: findError.message };
  }
  if (!row?.id) {
    return { ok: false, error: "Call not found for parentCallSid" };
  }

  const callId = row.id as string;
  const prevMeta = asMetadata(row.metadata);
  const amdSnapshot = {
    AnsweredBy: payload.answeredBy,
    child_call_sid: payload.childCallSid,
    machine_detection_duration_ms: payload.machineDetectionDurationMs,
    received_at: new Date().toISOString(),
    raw: payload.raw,
  };

  const { error: updateError } = await supabase
    .from("phone_calls")
    .update({
      metadata: {
        ...prevMeta,
        twilio_amd_last_callback: amdSnapshot,
      },
    })
    .eq("id", callId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  const { error: eventError } = await supabase.from("phone_call_events").insert({
    call_id: callId,
    event_type: "twilio.amd_status",
    payload: {
      answered_by: payload.answeredBy,
      child_call_sid: payload.childCallSid,
      machine_detection_duration_ms: payload.machineDetectionDurationMs,
      raw: payload.raw,
    },
  });

  if (eventError) {
    return { ok: false, error: eventError.message };
  }

  return { ok: true };
}

export type TwilioVoiceStatusPayload = {
  CallSid: string;
  CallStatus: string;
  DialCallStatus?: string | null;
  /** Present when AMD is enabled on the forwarded &lt;Number&gt; leg. */
  AnsweredBy?: string | null;
  From?: string | null;
  To?: string | null;
  /** Seconds; Twilio may send Duration or CallDuration */
  DurationSeconds?: number | null;
  raw: Record<string, string>;
};

/**
 * Update phone_calls by CallSid and append twilio.status_callback event.
 */
export async function applyTwilioVoiceStatusCallback(
  supabase: SupabaseClient,
  payload: TwilioVoiceStatusPayload
): Promise<{ ok: true; callId: string } | { ok: false; error: string }> {
  const externalCallId = payload.CallSid.trim();
  if (!externalCallId) {
    return { ok: false, error: "CallSid is required" };
  }

  const mapped = mapTwilioStatusToPhoneStatus({
    callStatus: payload.CallStatus,
    dialCallStatus: payload.DialCallStatus,
    answeredBy: payload.AnsweredBy ?? null,
  });

  const { data: row, error: findError } = await supabase
    .from("phone_calls")
    .select(
      "id, metadata, direction, voicemail_recording_sid, duration_seconds, status, assigned_to_user_id, from_e164, contact_id"
    )
    .eq("external_call_id", externalCallId)
    .maybeSingle();

  if (findError) {
    return { ok: false, error: findError.message };
  }
  if (!row?.id) {
    return { ok: false, error: "Call not found for external_call_id" };
  }

  const callId = row.id as string;
  const prevMeta = asMetadata(row.metadata);
  const direction = asOptionalString(row.direction) === "outbound" ? "outbound" : "inbound";
  const hadAssignee = row.assigned_to_user_id != null && String(row.assigned_to_user_id).trim() !== "";
  const vmSid = asOptionalString(row.voicemail_recording_sid);
  const durationSec =
    payload.DurationSeconds != null && payload.DurationSeconds >= 0
      ? payload.DurationSeconds
      : null;
  const rowDuration = asOptionalInt(row.duration_seconds);
  const effectiveDuration = resolveEffectiveCallDurationSeconds(
    durationSec,
    rowDuration,
    payload.raw
  );
  const previousStatus = asOptionalString(row.status);

  const finalStatus = refineInboundTwilioCompletedStatus(mapped, {
    direction,
    voicemailRecordingSid: vmSid,
    durationSeconds: effectiveDuration,
    previousPhoneStatus: previousStatus,
    answeredBy: payload.AnsweredBy ?? null,
  });

  const saintlyReclassification =
    finalStatus !== mapped
      ? finalStatus === "abandoned"
        ? "short_abandoned_inbound"
        : finalStatus === "missed"
          ? "no_bridge_completed_missed"
          : "inbound_completed_reclassified"
      : null;

  const updateRow: Record<string, unknown> = {
    status: finalStatus,
    metadata: {
      ...prevMeta,
      twilio_last_callback: {
        CallStatus: payload.CallStatus,
        DialCallStatus: payload.DialCallStatus ?? null,
        AnsweredBy: payload.AnsweredBy ?? null,
        DurationSeconds: payload.DurationSeconds ?? null,
        received_at: new Date().toISOString(),
        ...(finalStatus !== mapped
          ? {
              saintly_reclassified_from: mapped,
              saintly_reclassification: saintlyReclassification,
              saintly_effective_duration_seconds: effectiveDuration,
            }
          : {}),
      },
    },
  };

  const fromVal = asOptionalString(payload.From);
  const toVal = asOptionalString(payload.To);
  if (fromVal !== null) updateRow.from_e164 = fromVal;
  if (toVal !== null) updateRow.to_e164 = toVal;

  if (payload.DurationSeconds != null && payload.DurationSeconds >= 0) {
    updateRow.duration_seconds = payload.DurationSeconds;
  } else if (effectiveDuration != null) {
    updateRow.duration_seconds = effectiveDuration;
  }

  if (isTerminalPhoneStatus(finalStatus)) {
    updateRow.ended_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase.from("phone_calls").update(updateRow).eq("id", callId);
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  const fromE164 = fromVal ?? asOptionalString(row.from_e164);
  const existingContactId =
    row.contact_id != null && String(row.contact_id).trim() !== "" ? row.contact_id : null;
  if (direction === "inbound" && !existingContactId && fromE164) {
    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .or(`primary_phone.eq.${fromE164},secondary_phone.eq.${fromE164}`)
      .limit(1)
      .maybeSingle();

    if (contactErr) {
      console.warn("[phone_calls] CRM contact lookup:", contactErr.message);
    } else if (contact?.id) {
      const { error: linkErr } = await supabaseAdmin
        .from("phone_calls")
        .update({ contact_id: contact.id })
        .eq("id", callId)
        .is("contact_id", null);

      if (linkErr) {
        console.warn("[phone_calls] link contact_id:", linkErr.message);
      }
    }
  }

  const { error: eventError } = await supabase.from("phone_call_events").insert({
    call_id: callId,
    event_type: "twilio.status_callback",
    payload: {
      call_status: payload.CallStatus,
      dial_call_status: payload.DialCallStatus ?? null,
      answered_by: payload.AnsweredBy ?? null,
      from: payload.From ?? null,
      to: payload.To ?? null,
      duration_seconds: payload.DurationSeconds ?? null,
      effective_duration_seconds: effectiveDuration,
      mapped_status: finalStatus,
      twilio_mapped_status: mapped,
      raw: payload.raw,
    },
  });

  if (eventError) {
    return { ok: false, error: eventError.message };
  }

  await syncIncomingCallAlertFromPhoneStatus(supabase, callId, finalStatus);

  /** Inbound-only CRM side effects — outbound softphone "missed" must not page ops or auto-reply to callee. */
  if (direction === "inbound") {
    if (finalStatus === "missed" || finalStatus === "failed" || finalStatus === "cancelled") {
      const notif = await tryInsertMissedCallNotification(supabase, callId, {
        fromE164: fromVal ?? payload.From ?? null,
        terminalStatus: finalStatus,
        effectiveDurationSeconds: effectiveDuration,
      });
      if (!notif.ok) {
        console.warn("[phone_calls] missed_call notification:", notif.error);
      }
    }

    if (finalStatus === "missed") {
      await maybeAutoAssignMissedInboundCall(callId, direction, hadAssignee);
    }
  }

  if (isTerminalPhoneStatus(finalStatus)) {
    await awaitVoiceAiClassificationForWebhook(callId);
    if (direction === "inbound") {
      await triggerAutoFollowUp(supabase, callId);
    }
  }

  return { ok: true, callId };
}

export type TwilioVoicemailRecordingInput = {
  externalCallId: string;
  /** When set, lookup tries ParentCallSid before CallSid (covers child-leg recordings). */
  parentCallSid?: string | null;
  callSid?: string | null;
  recordingSid: string;
  recordingUrl: string | null;
  recordingDurationSeconds: number | null;
  recordingStatus: string | null;
  from: string | null;
  to: string | null;
  raw: Record<string, string>;
};

function externalCallIdLookupCandidates(input: TwilioVoicemailRecordingInput): string[] {
  const out: string[] = [];
  const add = (s: string | null | undefined) => {
    const t = (s ?? "").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(input.parentCallSid);
  add(input.callSid);
  add(input.externalCallId);
  return out;
}

/**
 * Persist Twilio recording callback on the parent inbound call (ParentCallSid || CallSid).
 * Idempotent per RecordingSid: skips duplicate event rows when the same sid is replayed.
 * Sets phone_calls.status to missed when a recording is successfully available (voicemail_* columns hold details).
 */
export async function applyTwilioVoicemailRecording(
  supabase: SupabaseClient,
  input: TwilioVoicemailRecordingInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const recordingSid = input.recordingSid.trim();
  if (!recordingSid) {
    return { ok: false, error: "recordingSid is required" };
  }

  const tryIds = externalCallIdLookupCandidates(input);
  if (tryIds.length === 0) {
    return { ok: false, error: "ParentCallSid, CallSid, or externalCallId is required" };
  }

  const statusLower = (input.recordingStatus || "").trim().toLowerCase();
  const hasUrl = Boolean(input.recordingUrl && input.recordingUrl.trim() !== "");
  const isFinalOk = statusLower === "completed" || hasUrl;

  let row: { id: unknown; metadata: unknown } | null = null;
  let findError: { message: string } | null = null;
  for (const ext of tryIds) {
    const { data, error } = await supabase
      .from("phone_calls")
      .select("id, metadata")
      .eq("external_call_id", ext)
      .maybeSingle();
    if (error) {
      findError = error;
      break;
    }
    if (data?.id) {
      row = data;
      break;
    }
  }

  if (findError) {
    return { ok: false, error: findError.message };
  }
  if (!row?.id) {
    console.warn("[phone_calls] voicemail recording: no row for Twilio call sids", {
      tryIds,
      recordingSid,
    });
    return { ok: false, error: "Call not found for external_call_id" };
  }

  const callId = row.id as string;
  const prevMeta = asMetadata(row.metadata);

  const { data: priorEvents, error: priorErr } = await supabase
    .from("phone_call_events")
    .select("id, payload")
    .eq("call_id", callId)
    .eq("event_type", "twilio.voicemail_recording");

  if (priorErr) {
    return { ok: false, error: priorErr.message };
  }

  const alreadyLoggedForSid = (priorEvents || []).some((ev) => {
    const p = ev.payload as Record<string, unknown> | null;
    return p && typeof p.recording_sid === "string" && p.recording_sid === recordingSid;
  });

  const saintlyVmEnabled = process.env.SAINTLY_VOICEMAIL_AI_PROCESSING !== "0";
  const prevVt = asMetadata(prevMeta.voicemail_transcription);
  const alreadyDoneSaintlyVm =
    Boolean(isFinalOk) &&
    saintlyVmEnabled &&
    prevVt.source === "saintly" &&
    prevVt.status === "completed" &&
    typeof prevVt.recording_sid === "string" &&
    prevVt.recording_sid.trim() === recordingSid;

  const voicemailTranscriptionMeta =
    isFinalOk && saintlyVmEnabled && !alreadyDoneSaintlyVm
      ? {
          ...prevVt,
          status: "queued",
          source: "saintly",
          queued_at: new Date().toISOString(),
          recording_sid: recordingSid,
        }
      : null;

  const updateRow: Record<string, unknown> = {
    voicemail_recording_sid: recordingSid,
    voicemail_status:
      (input.recordingStatus && input.recordingStatus.trim()) || statusLower || "unknown",
    metadata: {
      ...prevMeta,
      twilio_last_voicemail: {
        recording_sid: recordingSid,
        recording_status: input.recordingStatus ?? null,
        received_at: new Date().toISOString(),
      },
      ...(voicemailTranscriptionMeta ? { voicemail_transcription: voicemailTranscriptionMeta } : {}),
    },
  };

  const vmFrom = asOptionalString(input.from);
  const vmTo = asOptionalString(input.to);
  if (vmFrom !== null) updateRow.voicemail_from = vmFrom;
  if (vmTo !== null) updateRow.voicemail_to = vmTo;

  if (hasUrl) {
    updateRow.voicemail_recording_url = normalizeTwilioRecordingMediaUrl(input.recordingUrl!.trim());
  }

  if (input.recordingDurationSeconds != null && input.recordingDurationSeconds >= 0) {
    updateRow.voicemail_duration_seconds = input.recordingDurationSeconds;
  }

  if (isFinalOk) {
    updateRow.voicemail_received_at = new Date().toISOString();
    updateRow.status = "missed";
    updateRow.ended_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase.from("phone_calls").update(updateRow).eq("id", callId);
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  if (isFinalOk && !alreadyLoggedForSid) {
    const { error: eventError } = await supabase.from("phone_call_events").insert({
      call_id: callId,
      event_type: "twilio.voicemail_recording",
      payload: {
        recording_sid: recordingSid,
        recording_url: input.recordingUrl,
        recording_duration_seconds: input.recordingDurationSeconds,
        recording_status: input.recordingStatus,
        from: input.from,
        to: input.to,
        raw: input.raw,
      },
    });

    if (eventError) {
      return { ok: false, error: eventError.message };
    }
  }

  if (isFinalOk) {
    const notif = await tryInsertVoicemailNotification(supabase, callId, {
      fromE164: input.from,
      durationSeconds: input.recordingDurationSeconds,
    });
    if (!notif.ok) {
      console.warn("[phone_calls] voicemail notification:", notif.error);
    }
    await resolveIncomingCallAlertIfNeeded(supabase, callId);
  }

  if (isFinalOk) {
    await awaitVoiceAiClassificationForWebhook(callId);
    await triggerAutoFollowUp(supabase, callId);
    if (saintlyVmEnabled && !alreadyDoneSaintlyVm) {
      scheduleSaintlyVoicemailProcessing(callId);
    }
  }

  return { ok: true };
}

export type TwilioVoicemailTranscriptionInput = {
  recordingSid: string;
  transcriptionText: string | null;
  transcriptionStatus: string | null;
  /** Parent call sid when Twilio sends it (can arrive before recording callback sets `voicemail_recording_sid`). */
  callSid?: string | null;
  raw: Record<string, string>;
};

/**
 * Twilio Record transcribeCallback — match by `voicemail_recording_sid`, or by `external_call_id` when `callSid` is set.
 */
export async function applyTwilioVoicemailTranscription(
  supabase: SupabaseClient,
  input: TwilioVoicemailTranscriptionInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const recordingSid = input.recordingSid.trim();
  if (!recordingSid) {
    return { ok: false, error: "recordingSid is required" };
  }

  const { data: bySid, error: sidErr } = await supabase
    .from("phone_calls")
    .select("id, metadata, voicemail_recording_sid")
    .eq("voicemail_recording_sid", recordingSid)
    .maybeSingle();

  if (sidErr) {
    return { ok: false, error: sidErr.message };
  }

  let row = bySid?.id ? bySid : null;
  const callSid = (input.callSid ?? "").trim();

  if (!row && callSid) {
    const { data: byCall, error: callErr } = await supabase
      .from("phone_calls")
      .select("id, metadata, voicemail_recording_sid")
      .eq("external_call_id", callSid)
      .maybeSingle();
    if (callErr) {
      return { ok: false, error: callErr.message };
    }
    row = byCall?.id ? byCall : null;
  }

  if (!row?.id) {
    return { ok: false, error: "Call not found for voicemail transcription" };
  }

  const callId = row.id as string;
  const prevMeta = asMetadata(row.metadata);
  const text = (input.transcriptionText ?? "").trim();

  const nextMeta = {
    ...prevMeta,
    voicemail_transcription: {
      text: text || null,
      status: input.transcriptionStatus ?? null,
      updated_at: new Date().toISOString(),
    },
  };

  const patch: Record<string, unknown> = { metadata: nextMeta };
  const existingVmSid = typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid.trim() : "";
  if (!existingVmSid) {
    patch.voicemail_recording_sid = recordingSid;
  }

  const { error: updateError } = await supabase.from("phone_calls").update(patch).eq("id", callId);
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  const { error: eventError } = await supabase.from("phone_call_events").insert({
    call_id: callId,
    event_type: "twilio.voicemail_transcription",
    payload: {
      recording_sid: recordingSid,
      transcription_text: text || null,
      transcription_status: input.transcriptionStatus,
      raw: input.raw,
    },
  });

  if (eventError) {
    return { ok: false, error: eventError.message };
  }

  return { ok: true };
}
