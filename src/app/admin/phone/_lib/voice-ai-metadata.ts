import type { PhoneCallRow } from "../recent-calls-live";

export type VoiceAiThreadSlice = {
  short_summary: string;
  urgency: string;
  route_target: string;
  caller_category: string;
  callback_needed: boolean;
  classified_at: string | null;
  source: string | null;
  confidence_category: string | null;
  confidence_summary: string | null;
  live_transcript_excerpt: string | null;
  closing_message: string | null;
  recommended_action: string | null;
};

const CALLER_LABEL: Record<string, string> = {
  patient_family: "Patient / family",
  caregiver_applicant: "Caregiver applicant",
  referral_provider: "Referral / provider",
  vendor_other: "Vendor / other",
  spam: "Spam",
};

const ROUTE_LABEL: Record<string, string> = {
  intake_queue: "Intake queue",
  hiring_queue: "Hiring",
  referral_team: "Referral team",
  procurement: "Procurement",
  security: "Security",
  noop: "No route",
};

/** Display caps to keep thread layout stable (full data remains in metadata). */
const UI_SHORT_SUMMARY_MAX = 420;
const UI_CONFIDENCE_SUMMARY_MAX = 260;
const UI_TRANSCRIPT_MAX = 360;
const UI_CLOSING_MAX = 220;
const UI_RECOMMENDED_ACTION_MAX = 220;

function clampUiText(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trim()}…`;
}

export function formatConfidenceCategoryLabel(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return "—";
  const k = String(raw).trim().toLowerCase();
  if (k === "low" || k === "medium" || k === "high") {
    return k.charAt(0).toUpperCase() + k.slice(1);
  }
  return String(raw).trim().slice(0, 48);
}

export function formatUrgencyLabel(raw: string): string {
  const k = raw.trim().toLowerCase();
  if (!k) return "—";
  return k;
}

export function formatVoiceAiCallerCategoryLabel(raw: string): string {
  const k = raw.trim();
  return CALLER_LABEL[k] ?? k.replace(/_/g, " ");
}

export function formatVoiceAiRouteTargetLabel(raw: string): string {
  const k = raw.trim();
  return ROUTE_LABEL[k] ?? k.replace(/_/g, " ");
}

export function urgencyBadgeClass(urgency: string): string {
  const u = urgency.trim().toLowerCase();
  switch (u) {
    case "critical":
      return "border-rose-300 bg-rose-100 text-rose-950";
    case "high":
      return "border-orange-300 bg-orange-50 text-orange-950";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-950";
    default:
      return "border-slate-300 bg-slate-100 text-slate-800";
  }
}

/**
 * Read-only parse of `metadata.voice_ai` when you only have `phone_calls.metadata` JSON.
 * Null-safe if `metadata` or `voice_ai` is null/undefined/non-object.
 */
export function readVoiceAiMetadataFromMetadata(metadata: PhoneCallRow["metadata"]): VoiceAiThreadSlice | null {
  return readVoiceAiMetadata({ metadata } as PhoneCallRow);
}

/** Read-only parse of `metadata.voice_ai` for thread UI. */
export function readVoiceAiMetadata(row: PhoneCallRow | null): VoiceAiThreadSlice | null {
  if (!row?.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) {
    return null;
  }
  const v = (row.metadata as Record<string, unknown>).voice_ai;
  if (v == null || typeof v !== "object" || Array.isArray(v)) {
    return null;
  }
  const o = v as Record<string, unknown>;
  const short_summary = typeof o.short_summary === "string" ? o.short_summary.trim() : "";
  const urgency = typeof o.urgency === "string" ? o.urgency.trim().toLowerCase() : "low";
  const route_target = typeof o.route_target === "string" ? o.route_target.trim().toLowerCase() : "";
  const caller_category = typeof o.caller_category === "string" ? o.caller_category.trim() : "";
  const callback_needed = Boolean(o.callback_needed);
  const classified_at = typeof o.classified_at === "string" ? o.classified_at.trim() : null;
  const source = typeof o.source === "string" ? o.source.trim() : null;

  const confRaw =
    o.confidence && typeof o.confidence === "object" && !Array.isArray(o.confidence)
      ? (o.confidence as Record<string, unknown>)
      : null;
  const confidence_category =
    confRaw && typeof confRaw.category === "string" ? confRaw.category.trim().toLowerCase() : null;
  const confidence_summaryRaw =
    confRaw && typeof confRaw.summary === "string" ? confRaw.summary.trim() : "";
  const confidence_summary = confidence_summaryRaw
    ? clampUiText(confidence_summaryRaw, UI_CONFIDENCE_SUMMARY_MAX)
    : null;

  const live_transcript_excerpt =
    typeof o.live_transcript_excerpt === "string" && o.live_transcript_excerpt.trim()
      ? clampUiText(o.live_transcript_excerpt.trim(), UI_TRANSCRIPT_MAX)
      : null;
  const closing_message =
    typeof o.closing_message === "string" && o.closing_message.trim()
      ? clampUiText(o.closing_message.trim(), UI_CLOSING_MAX)
      : null;

  const recommended_actionRaw = typeof o.recommended_action === "string" ? o.recommended_action.trim() : "";
  const recommended_action = recommended_actionRaw
    ? clampUiText(recommended_actionRaw, UI_RECOMMENDED_ACTION_MAX)
    : null;

  const hasAny =
    Boolean(classified_at) ||
    Boolean(short_summary) ||
    Boolean(caller_category) ||
    Boolean(live_transcript_excerpt) ||
    Boolean(closing_message) ||
    Boolean(confidence_summaryRaw) ||
    Boolean(confidence_category) ||
    Boolean(recommended_action);
  if (!hasAny) {
    return null;
  }

  const short_summary_ui = short_summary ? clampUiText(short_summary, UI_SHORT_SUMMARY_MAX) : "";

  return {
    short_summary: short_summary_ui,
    urgency,
    route_target,
    caller_category,
    callback_needed,
    classified_at,
    source,
    confidence_category,
    confidence_summary,
    live_transcript_excerpt,
    closing_message,
    recommended_action,
  };
}
