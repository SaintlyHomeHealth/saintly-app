"use server";

import { supabaseAdmin } from "@/lib/admin";
import { buildPhoneCallAiContextBlock, fetchOpenAiJsonObject } from "@/lib/phone/phone-call-ai-context";
import { canStaffAccessPhoneCallRow } from "@/lib/phone/staff-call-access";
import { getStaffProfile, isPhoneWorkspaceUser } from "@/lib/staff-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CRM_SUGGEST_TAGS_MAX = 500;
const CRM_AI_REASON_MAX = 420;

export type CrmAiConfidence = "low" | "medium" | "high";

export type CrmAiAlternative = {
  type: string;
  outcome: string;
};

export type SuggestPhoneCallCrmResult =
  | {
      ok: true;
      type: string;
      outcome: string;
      tags: string;
      confidence: CrmAiConfidence;
      reason: string;
      alternatives: CrmAiAlternative[];
    }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You classify phone intake records for a home health agency (Saintly Home Health).
You only see structured metadata — there may be no call transcript.
Return a single JSON object with exactly these keys:
- "type": one of "patient", "caregiver", "referral", "spam", or "" (empty string if uncertain)
- "outcome": one of "booked_assessment", "needs_followup", "not_qualified", "wrong_number", or "" (empty if uncertain)
- "tags": a short comma-separated list of 2–6 lowercase tags (e.g. "callback,insurance,missed") — no phone numbers, no PHI; max about 120 characters
- "confidence": exactly one of "low", "medium", "high" — how sure you are given only metadata (use "low" when data is thin or conflicting)
- "reason": one or two short sentences in plain language (under 400 characters) explaining why you chose type/outcome/tags — no PHI
- "alternatives": optional array of 0–2 objects; each object may include "type" and/or "outcome" using the same allowed values as above. Include only when confidence is not "high", to list plausible other combinations staff might consider.

Prefer empty strings over guessing when signals are weak. If primary_tag or saved CRM already indicates spam, align with that.`;

function normalizeConfidence(raw: unknown): CrmAiConfidence {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "low" || s === "medium" || s === "high") return s;
  return "medium";
}

function normalizeReason(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, CRM_AI_REASON_MAX);
}

function normalizeAlternatives(
  raw: unknown,
  confidence: CrmAiConfidence
): CrmAiAlternative[] {
  if (confidence === "high") return [];
  if (!Array.isArray(raw)) return [];
  const out: CrmAiAlternative[] = [];
  for (const item of raw.slice(0, 2)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    let type = typeof rec.type === "string" ? rec.type.trim().toLowerCase() : "";
    if (type && !["patient", "caregiver", "referral", "spam"].includes(type)) {
      type = "";
    }
    let outcome = typeof rec.outcome === "string" ? rec.outcome.trim() : "";
    if (
      outcome &&
      !["booked_assessment", "needs_followup", "not_qualified", "wrong_number"].includes(outcome)
    ) {
      outcome = "";
    }
    if (!type && !outcome) continue;
    out.push({ type, outcome });
  }
  return out;
}

function normalizeFullSuggestion(raw: unknown): {
  type: string;
  outcome: string;
  tags: string;
  confidence: CrmAiConfidence;
  reason: string;
  alternatives: CrmAiAlternative[];
} {
  const emptyBase = { type: "", outcome: "", tags: "" };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ...emptyBase,
      confidence: "medium",
      reason: "",
      alternatives: [],
    };
  }
  const o = raw as Record<string, unknown>;

  let type = typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
  if (type && !["patient", "caregiver", "referral", "spam"].includes(type)) {
    type = "";
  }

  let outcome = typeof o.outcome === "string" ? o.outcome.trim() : "";
  if (
    outcome &&
    !["booked_assessment", "needs_followup", "not_qualified", "wrong_number"].includes(outcome)
  ) {
    outcome = "";
  }

  let tags = typeof o.tags === "string" ? o.tags.trim().slice(0, CRM_SUGGEST_TAGS_MAX) : "";
  tags = tags.replace(/\s+/g, " ");

  const confidence = normalizeConfidence(o.confidence);
  const reason = normalizeReason(o.reason);
  const alternatives = normalizeAlternatives(o.alternatives, confidence);

  return { type, outcome, tags, confidence, reason, alternatives };
}

async function fetchOpenAiSuggestion(userContent: string): Promise<{
  type: string;
  outcome: string;
  tags: string;
  confidence: CrmAiConfidence;
  reason: string;
  alternatives: CrmAiAlternative[];
} | null> {
  const parsed = await fetchOpenAiJsonObject(SYSTEM_PROMPT, userContent);
  if (parsed == null) return null;
  return normalizeFullSuggestion(parsed);
}

/**
 * Suggests CRM type, outcome, and tags from call metadata only. Does not persist.
 * Staff must review and save via existing `updatePhoneCallCrmClassification`.
 */
export async function suggestPhoneCallCrmClassification(phoneCallId: string): Promise<SuggestPhoneCallCrmResult> {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const id = typeof phoneCallId === "string" ? phoneCallId.trim() : "";
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, error: "invalid_call" };
  }

  const { data: raw, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select(
      "direction, from_e164, to_e164, status, started_at, ended_at, duration_seconds, primary_tag, contact_id, metadata, voicemail_recording_sid, priority_sms_reason, auto_reply_sms_body, assigned_to_user_id, contacts ( full_name, first_name, last_name )"
    )
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !raw) {
    console.warn("[admin/phone] suggestPhoneCallCrmClassification load:", loadErr?.message);
    return { ok: false, error: "load_failed" };
  }

  const row = raw as Record<string, unknown>;
  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id: typeof row.assigned_to_user_id === "string" ? row.assigned_to_user_id : null,
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, error: "ai_unconfigured" };
  }

  const context = buildPhoneCallAiContextBlock(row);
  const userMessage = `Suggest CRM classification for this call.\n\n${context}`;

  const suggestion = await fetchOpenAiSuggestion(userMessage);
  if (!suggestion) {
    return { ok: false, error: "ai_failed" };
  }

  return {
    ok: true,
    type: suggestion.type,
    outcome: suggestion.outcome,
    tags: suggestion.tags,
    confidence: suggestion.confidence,
    reason: suggestion.reason,
    alternatives: suggestion.alternatives,
  };
}
