import { supabaseAdmin } from "@/lib/admin";
import { buildPhoneCallAiContextBlock, fetchOpenAiJsonObject } from "@/lib/phone/phone-call-ai-context";
import { maybeEnsureVoiceAiFollowupTask, type VoiceAiFollowupPayload } from "@/lib/phone/voice-ai-followup-task";
import { maybeSendVoiceAiCallbackFollowupSms } from "@/lib/phone/voice-ai-callback-sms";

const VOICE_AI_SUMMARY_MAX = 600;
const VOICE_AI_CONF_REASON_MAX = 240;

const CALLER_CATEGORIES = new Set([
  "patient_family",
  "caregiver_applicant",
  "referral_provider",
  "vendor_other",
  "spam",
]);

const URGENCY = new Set(["low", "medium", "high", "critical"]);

const ROUTE_TARGETS = new Set([
  "intake_queue",
  "hiring_queue",
  "referral_team",
  "procurement",
  "security",
  "noop",
]);

const CRM_TYPES = new Set(["", "patient", "caregiver", "referral", "spam"]);
const CRM_OUTCOMES = new Set([
  "",
  "booked_assessment",
  "needs_followup",
  "not_qualified",
  "wrong_number",
]);

function isTerminalCallStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (
    s === "completed" ||
    s === "missed" ||
    s === "abandoned" ||
    s === "failed" ||
    s === "cancelled"
  );
}

export const VOICE_AI_CLASSIFICATION_SYSTEM_PROMPT = `You classify phone intake records for Saintly Home Health (home health agency).
You only see structured call metadata — there may be no transcript or a voicemail excerpt below.
Return a single JSON object with exactly these keys:
- "caller_category": one of "patient_family", "caregiver_applicant", "referral_provider", "vendor_other", "spam"
- "crm": object with keys "type", "outcome", "tags", "note" where:
  - "type": one of "patient", "caregiver", "referral", "spam", or "" if uncertain
  - "outcome": one of "booked_assessment", "needs_followup", "not_qualified", "wrong_number", or ""
  - "tags": short comma-separated lowercase tags, no phone numbers, minimal PHI
  - "note": optional one-sentence machine note or ""
- "urgency": one of "low", "medium", "high", "critical"
- "callback_needed": boolean
- "short_summary": 2-4 sentences for staff, no raw phone numbers, avoid PHI
- "recommended_action": one short imperative line for staff (e.g. "Return call within 2 hours", "Review referral fax") or ""
- "excerpt": optional short quote or paraphrase of what mattered (from voicemail/context if present); otherwise ""
- "route_target": one of "intake_queue", "hiring_queue", "referral_team", "procurement", "security", "noop"
- "confidence": object with "category" (one of "low","medium","high") and "summary" (one short sentence)

These are suggestions only; staff CRM fields are stored separately. Prefer conservative urgency when uncertain.`;

/** Same prompt as background voice AI classification (Whisper + voicemail pipeline reuse). */
export function getVoiceAiClassificationSystemPrompt(): string {
  return VOICE_AI_CLASSIFICATION_SYSTEM_PROMPT;
}

export type VoiceAiCrmSuggestion = {
  type: string;
  outcome: string;
  tags: string;
  note: string;
};

export type VoiceAiSource = "background" | "live_receptionist";

export type VoiceAiStoredPayload = {
  schema_version: "1.0";
  source: VoiceAiSource;
  classified_at: string;
  /** Hash of inputs used for classification; skip re-run when unchanged. */
  input_fingerprint: string;
  caller_category: string;
  crm_suggestion: VoiceAiCrmSuggestion;
  urgency: string;
  callback_needed: boolean;
  short_summary: string;
  route_target: string;
  confidence: { category: string; summary: string };
  /** After-call / voicemail: short excerpt or quote (no PHI). */
  live_transcript_excerpt?: string;
  /** One-line staff next step (after-call summaries). */
  recommended_action?: string;
  /** Live AI path only: line read to caller before transfer or hangup. */
  closing_message?: string;
  /** Survives reclassification when set by automatic callback follow-up SMS. */
  callback_followup_sms_sent_at?: string;
  callback_followup_sms_message_sid?: string;
  callback_followup_sms_last_error?: string;
  callback_followup_sms_last_attempt_at?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function normalizeCrmSub(raw: unknown): VoiceAiCrmSuggestion {
  const empty = { type: "", outcome: "", tags: "", note: "" };
  const o = asRecord(raw);
  if (!o) return empty;

  let type = typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
  if (type && !CRM_TYPES.has(type)) type = "";

  let outcome = typeof o.outcome === "string" ? o.outcome.trim() : "";
  if (outcome && !CRM_OUTCOMES.has(outcome)) outcome = "";

  let tags = typeof o.tags === "string" ? o.tags.trim().slice(0, 500) : "";
  tags = tags.replace(/\s+/g, " ");

  let note = typeof o.note === "string" ? o.note.trim().slice(0, 2000) : "";
  note = note.replace(/\s+/g, " ");

  return { type, outcome, tags, note };
}

export type NormalizeVoiceAiPayloadOptions = {
  source?: VoiceAiSource;
  live_transcript_excerpt?: string;
};

export function normalizeVoiceAiPayload(
  raw: unknown,
  inputFingerprint: string,
  options?: NormalizeVoiceAiPayloadOptions
): VoiceAiStoredPayload | null {
  const o = asRecord(raw);
  if (!o) return null;

  const source: VoiceAiSource = options?.source ?? "background";

  let caller_category = typeof o.caller_category === "string" ? o.caller_category.trim() : "";
  if (!CALLER_CATEGORIES.has(caller_category)) caller_category = "patient_family";

  const crm_suggestion = normalizeCrmSub(o.crm);

  let urgency = typeof o.urgency === "string" ? o.urgency.trim().toLowerCase() : "";
  if (!URGENCY.has(urgency)) urgency = "medium";

  const callback_needed = Boolean(o.callback_needed);

  let short_summary =
    typeof o.short_summary === "string" ? o.short_summary.trim().replace(/\s+/g, " ") : "";
  short_summary = short_summary.slice(0, VOICE_AI_SUMMARY_MAX);

  let route_target = typeof o.route_target === "string" ? o.route_target.trim().toLowerCase() : "";
  if (!ROUTE_TARGETS.has(route_target)) route_target = "intake_queue";

  const confRaw = asRecord(o.confidence);
  let cat = confRaw && typeof confRaw.category === "string" ? confRaw.category.trim().toLowerCase() : "";
  if (cat !== "low" && cat !== "medium" && cat !== "high") cat = "medium";
  const summary =
    confRaw && typeof confRaw.summary === "string"
      ? confRaw.summary.trim().replace(/\s+/g, " ").slice(0, VOICE_AI_CONF_REASON_MAX)
      : "";

  let closing_message =
    typeof o.closing_message === "string" ? o.closing_message.trim().replace(/\s+/g, " ") : "";
  closing_message = closing_message.slice(0, 400);

  const excerptFromModel =
    typeof o.excerpt === "string" ? o.excerpt.trim().replace(/\s+/g, " ").slice(0, 500) : "";
  const optExcerpt = options?.live_transcript_excerpt?.trim().slice(0, 500) ?? "";
  const legacyLiveExcerpt =
    typeof o.live_transcript_excerpt === "string" ? o.live_transcript_excerpt.trim().slice(0, 500) : "";
  const liveExcerpt = optExcerpt || excerptFromModel || legacyLiveExcerpt;

  let recommended_action =
    typeof o.recommended_action === "string" ? o.recommended_action.trim().replace(/\s+/g, " ") : "";
  recommended_action = recommended_action.slice(0, 240);

  const base: VoiceAiStoredPayload = {
    schema_version: "1.0",
    source,
    classified_at: new Date().toISOString(),
    input_fingerprint: inputFingerprint,
    caller_category,
    crm_suggestion,
    urgency,
    callback_needed,
    short_summary,
    route_target,
    confidence: { category: cat, summary },
  };

  if (liveExcerpt) {
    base.live_transcript_excerpt = liveExcerpt;
  }
  if (recommended_action) {
    base.recommended_action = recommended_action;
  }
  if (closing_message && source === "live_receptionist") {
    base.closing_message = closing_message;
  }

  return base;
}

/**
 * Merges `metadata.voice_ai`. Preserves live transcript when a later background run overwrites.
 * Does not modify `metadata.crm`.
 */
export async function persistVoiceAiMetadata(callId: string, voicePayload: VoiceAiStoredPayload): Promise<void> {
  console.log("[voice-ai-debug] persistVoiceAiMetadata start", {
    callId,
    source: voicePayload.source,
    caller_category: voicePayload.caller_category,
  });
  const { data: row, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata")
    .eq("id", callId)
    .maybeSingle();

  if (loadErr || !row) {
    console.warn("[voice-ai-background] load metadata:", loadErr?.message);
    return;
  }

  const prev =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  const prevVoice = asRecord(prev.voice_ai);
  let merged: VoiceAiStoredPayload = voicePayload;

  if (
    voicePayload.source === "background" &&
    prevVoice &&
    typeof prevVoice.live_transcript_excerpt === "string" &&
    prevVoice.live_transcript_excerpt.trim() &&
    !voicePayload.live_transcript_excerpt
  ) {
    merged = {
      ...voicePayload,
      live_transcript_excerpt: prevVoice.live_transcript_excerpt.trim().slice(0, 500),
    };
  }
  if (
    voicePayload.source === "background" &&
    prevVoice &&
    typeof prevVoice.closing_message === "string" &&
    prevVoice.closing_message.trim() &&
    !voicePayload.closing_message
  ) {
    merged = {
      ...merged,
      closing_message: prevVoice.closing_message.trim().slice(0, 400),
    };
  }
  if (
    voicePayload.source === "background" &&
    prevVoice &&
    typeof prevVoice.recommended_action === "string" &&
    prevVoice.recommended_action.trim() &&
    !voicePayload.recommended_action
  ) {
    merged = {
      ...merged,
      recommended_action: prevVoice.recommended_action.trim().slice(0, 240),
    };
  }

  if (prevVoice) {
    const preserved: Partial<VoiceAiStoredPayload> = {};
    if (
      typeof prevVoice.callback_followup_sms_sent_at === "string" &&
      prevVoice.callback_followup_sms_sent_at.trim()
    ) {
      preserved.callback_followup_sms_sent_at = prevVoice.callback_followup_sms_sent_at.trim();
    }
    if (
      typeof prevVoice.callback_followup_sms_message_sid === "string" &&
      prevVoice.callback_followup_sms_message_sid.trim()
    ) {
      preserved.callback_followup_sms_message_sid = prevVoice.callback_followup_sms_message_sid.trim();
    }
    if (
      typeof prevVoice.callback_followup_sms_last_error === "string" &&
      prevVoice.callback_followup_sms_last_error.trim()
    ) {
      preserved.callback_followup_sms_last_error = prevVoice.callback_followup_sms_last_error.trim();
    }
    if (
      typeof prevVoice.callback_followup_sms_last_attempt_at === "string" &&
      prevVoice.callback_followup_sms_last_attempt_at.trim()
    ) {
      preserved.callback_followup_sms_last_attempt_at = prevVoice.callback_followup_sms_last_attempt_at.trim();
    }
    if (Object.keys(preserved).length > 0) {
      merged = { ...merged, ...preserved };
    }
  }

  const nextMetadata: Record<string, unknown> = {
    ...prev,
    voice_ai: merged as unknown as Record<string, unknown>,
  };

  const { error: updErr } = await supabaseAdmin
    .from("phone_calls")
    .update({ metadata: nextMetadata })
    .eq("id", callId);

  if (updErr) {
    console.warn("[voice-ai-background] update metadata:", updErr.message);
    return;
  }

  console.log("[voice-ai-debug] persistVoiceAiMetadata wrote metadata.voice_ai", { callId });

  await maybeEnsureVoiceAiFollowupTask(supabaseAdmin, callId, merged);
  await maybeSendVoiceAiCallbackFollowupSms(supabaseAdmin, callId, merged as VoiceAiFollowupPayload);
}

/**
 * Cost guard: run after-call AI only when voicemail, long enough duration, known contact, or voicemail text exists.
 * Set VOICE_AI_AFTER_CALL_MIN_DURATION_SECONDS (default 25).
 */
export function shouldQualifyAfterCallAi(row: Record<string, unknown>): boolean {
  const vm =
    typeof row.voicemail_recording_sid === "string" && row.voicemail_recording_sid.trim() !== "";
  const vmDur =
    typeof row.voicemail_duration_seconds === "number" && Number.isFinite(row.voicemail_duration_seconds)
      ? row.voicemail_duration_seconds
      : 0;
  const dur =
    typeof row.duration_seconds === "number" && Number.isFinite(row.duration_seconds) ? row.duration_seconds : 0;
  const rawMin = process.env.VOICE_AI_AFTER_CALL_MIN_DURATION_SECONDS ?? "25";
  const parsed = Number.parseInt(rawMin, 10);
  const threshold = Number.isFinite(parsed) && parsed > 0 ? parsed : 25;

  const direction = (typeof row.direction === "string" ? row.direction : "").trim().toLowerCase();
  const inbound = direction !== "outbound";
  const hasContact = row.contact_id != null && String(row.contact_id).trim() !== "";

  const meta = asRecord(row.metadata);
  const vt = meta ? asRecord(meta.voicemail_transcription) : null;
  const vmText = vt && typeof vt.text === "string" ? vt.text.trim() : "";
  const hasVmText = vmText.length > 0;

  if (vm || vmDur > 0) return true;
  if (hasVmText) return true;
  if (dur >= threshold) return true;
  if (inbound && hasContact) return true;
  return false;
}

/** Stable string over materially relevant row fields (status, VM, durations, CRM hints). */
export function buildVoiceAiInputFingerprint(row: Record<string, unknown>): string {
  const status = (typeof row.status === "string" ? row.status : "").trim().toLowerCase();
  const vmSid = typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid.trim() : "";
  const vmPresent = vmSid ? "1" : "0";
  const vmDur =
    typeof row.voicemail_duration_seconds === "number" && Number.isFinite(row.voicemail_duration_seconds)
      ? String(Math.round(row.voicemail_duration_seconds))
      : "";
  const dur =
    typeof row.duration_seconds === "number" && Number.isFinite(row.duration_seconds)
      ? String(Math.round(row.duration_seconds))
      : "";
  const ended = typeof row.ended_at === "string" ? row.ended_at.trim() : "";
  const pt = typeof row.primary_tag === "string" ? row.primary_tag.trim().toLowerCase() : "";
  const hasContact = row.contact_id != null && String(row.contact_id).trim() !== "" ? "1" : "0";
  const pr =
    typeof row.priority_sms_reason === "string" && row.priority_sms_reason.trim()
      ? "1"
      : "0";
  return `v1|${status}|${vmPresent}|${vmDur}|${dur}|${ended}|${pt}|${hasContact}|${pr}`;
}

function existingVoiceAiFingerprint(metadata: unknown): string | null {
  const meta = asRecord(metadata);
  if (!meta) return null;
  const v = asRecord(meta.voice_ai);
  if (!v) return null;
  const fp = typeof v.input_fingerprint === "string" ? v.input_fingerprint.trim() : "";
  return fp.length > 0 ? fp : null;
}

/** Serialized work per callId: later triggers wait, then re-check fingerprint (e.g. after voicemail lands). */
const inflightByCallId = new Map<string, Promise<void>>();

async function executeVoiceAiClassification(callId: string): Promise<void> {
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  console.log("[after-call-ai] execute enter", { callId, hasOpenAiKey });

  if (!hasOpenAiKey) {
    console.log("[after-call-ai] skip: no OPENAI_API_KEY");
    return;
  }

  const { data: raw, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select(
      "id, status, direction, from_e164, to_e164, started_at, ended_at, duration_seconds, primary_tag, contact_id, metadata, voicemail_recording_sid, voicemail_duration_seconds, priority_sms_reason, auto_reply_sms_body, contacts ( full_name, first_name, last_name )"
    )
    .eq("id", callId)
    .maybeSingle();

  if (loadErr || !raw) {
    console.log("[after-call-ai] skip: load row failed", {
      callId,
      message: loadErr?.message ?? "no row",
    });
    return;
  }

  const row = raw as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : "";
  if (!isTerminalCallStatus(status)) {
    console.log("[after-call-ai] skip: status not terminal", { callId, status });
    return;
  }

  if (!shouldQualifyAfterCallAi(row)) {
    console.log("[after-call-ai] skip: qualification (duration/vm/contact)", {
      callId,
      duration_seconds: row.duration_seconds,
    });
    return;
  }

  const fingerprint = buildVoiceAiInputFingerprint(row);
  const prevFp = existingVoiceAiFingerprint(row.metadata);
  if (prevFp !== null && prevFp === fingerprint) {
    console.log("[after-call-ai] skip: fingerprint unchanged", { callId });
    return;
  }

  const context = buildPhoneCallAiContextBlock(row);
  const userMessage = `Produce the voice AI classification JSON for this completed or missed call.\n\n${context}`;

  const parsed = await fetchOpenAiJsonObject(VOICE_AI_CLASSIFICATION_SYSTEM_PROMPT, userMessage);
  if (parsed == null) {
    console.log("[after-call-ai] skip: OpenAI returned empty payload", { callId });
    return;
  }

  const normalized = normalizeVoiceAiPayload(parsed, fingerprint, { source: "background" });
  if (!normalized) {
    console.log("[after-call-ai] skip: normalize failed", { callId });
    return;
  }

  console.log("[after-call-ai] persist summary", {
    callId,
    caller_category: normalized.caller_category,
  });
  await persistVoiceAiMetadata(callId, normalized);
  console.log("[after-call-ai] persisted metadata.voice_ai", { callId });
}

/**
 * Runs after terminal call states; non-blocking. Failures are silent (logged only).
 * Writes `metadata.voice_ai` without modifying `metadata.crm`.
 * Skips when `input_fingerprint` matches a previous run; serializes concurrent triggers per callId.
 */
export async function runPhoneCallVoiceAiClassification(callId: string): Promise<void> {
  const id = callId.trim();
  if (!id) return;

  const prev = inflightByCallId.get(id);
  const chain = (async () => {
    if (prev) await prev.catch(() => {});
    await executeVoiceAiClassification(id);
  })();

  inflightByCallId.set(id, chain);

  try {
    await chain;
  } finally {
    if (inflightByCallId.get(id) === chain) {
      inflightByCallId.delete(id);
    }
  }
}

/**
 * Fire-and-forget background classification (queueMicrotask). Prefer
 * {@link awaitVoiceAiClassificationForWebhook} from Twilio webhooks so work runs before the request ends.
 */
export function schedulePhoneCallVoiceAiClassification(callId: string): void {
  if (!callId?.trim()) return;
  const id = callId.trim();
  console.log("[voice-ai-debug] schedulePhoneCallVoiceAiClassification", {
    callId: id,
    mode: "queueMicrotask",
  });
  queueMicrotask(() => {
    void runPhoneCallVoiceAiClassification(id).catch((e) => {
      console.warn("[voice-ai-background] unhandled:", e);
    });
  });
}

/**
 * Await classification in the same request as Twilio status/recording webhooks (avoids serverless freeze
 * before queueMicrotask / background work completes).
 */
export async function awaitVoiceAiClassificationForWebhook(callId: string): Promise<void> {
  const id = callId.trim();
  if (!id) return;
  console.log("[voice-ai-debug] awaitVoiceAiClassificationForWebhook (await in webhook)", { callId: id });
  try {
    await runPhoneCallVoiceAiClassification(id);
  } catch (e) {
    console.warn("[voice-ai-debug] awaitVoiceAiClassificationForWebhook error", e);
  }
}
