import "server-only";

/** Privacy-safe counters in `conversations.metadata.sms_suggestion_telemetry` (no message bodies). */
export type SmsSuggestionTelemetry = {
  generation_count: number;
  shown_count: number;
  sent_unchanged_count: number;
  sent_edited_count: number;
  superseded_count: number;
  sent_no_active_suggestion_count: number;
  last_event?: string;
  last_event_at?: string;
  /** Idempotency: last inbound message id for which we counted a "shown" event. */
  last_shown_for_message_id?: string;
};

/** Parse `conversations.metadata.sms_suggestion_telemetry` for display / tooling. */
export function parseSmsSuggestionTelemetry(raw: unknown): SmsSuggestionTelemetry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      generation_count: 0,
      shown_count: 0,
      sent_unchanged_count: 0,
      sent_edited_count: 0,
      superseded_count: 0,
      sent_no_active_suggestion_count: 0,
    };
  }
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  return {
    generation_count: num(o.generation_count),
    shown_count: num(o.shown_count),
    sent_unchanged_count: num(o.sent_unchanged_count),
    sent_edited_count: num(o.sent_edited_count),
    superseded_count: num(o.superseded_count),
    sent_no_active_suggestion_count: num(o.sent_no_active_suggestion_count),
    last_event: typeof o.last_event === "string" ? o.last_event : undefined,
    last_event_at: typeof o.last_event_at === "string" ? o.last_event_at : undefined,
    last_shown_for_message_id:
      typeof o.last_shown_for_message_id === "string" ? o.last_shown_for_message_id : undefined,
  };
}

export function mergeTelemetryOnGeneration(
  prevMeta: Record<string, unknown>,
  inboundMessageId: string,
  generatedAt: string
): Record<string, unknown> {
  const prev = parseSmsSuggestionTelemetry(prevMeta.sms_suggestion_telemetry);
  const prevSuggestion = prevMeta.sms_reply_suggestion;
  let superseded = prev.superseded_count;
  if (prevSuggestion && typeof prevSuggestion === "object" && !Array.isArray(prevSuggestion)) {
    const prevFor = String((prevSuggestion as Record<string, unknown>).for_message_id ?? "").trim();
    if (prevFor && prevFor !== inboundMessageId.trim()) {
      superseded += 1;
    }
  }
  return {
    ...prev,
    generation_count: prev.generation_count + 1,
    superseded_count: superseded,
    last_event: "generated",
    last_event_at: generatedAt,
  };
}

/** Returns null if already recorded for this suggestion or no matching active suggestion. */
export function mergeTelemetryOnShown(
  prevMeta: Record<string, unknown>,
  forMessageId: string
): Record<string, unknown> | null {
  const sug = prevMeta.sms_reply_suggestion;
  if (!sug || typeof sug !== "object" || Array.isArray(sug)) return null;
  const curFor = String((sug as Record<string, unknown>).for_message_id ?? "").trim();
  if (!curFor || curFor !== forMessageId.trim()) return null;

  const prev = parseSmsSuggestionTelemetry(prevMeta.sms_suggestion_telemetry);
  if (prev.last_shown_for_message_id === curFor) {
    return null;
  }
  return {
    ...prev,
    shown_count: prev.shown_count + 1,
    last_shown_for_message_id: curFor,
    last_event: "shown",
    last_event_at: new Date().toISOString(),
  };
}

export function mergeTelemetryOnSend(
  prevMeta: Record<string, unknown>,
  outboundBody: string
): { telemetry: Record<string, unknown>; deleteSuggestion: boolean } {
  const suggestion = prevMeta.sms_reply_suggestion;
  const prev = parseSmsSuggestionTelemetry(prevMeta.sms_suggestion_telemetry);
  const now = new Date().toISOString();

  if (!suggestion || typeof suggestion !== "object" || Array.isArray(suggestion)) {
    return {
      telemetry: {
        ...prev,
        sent_no_active_suggestion_count: prev.sent_no_active_suggestion_count + 1,
        last_event: "sent_no_active_suggestion",
        last_event_at: now,
      },
      deleteSuggestion: false,
    };
  }

  const s = suggestion as Record<string, unknown>;
  const sugText = typeof s.text === "string" ? s.text.trim() : "";
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  const same = sugText.length > 0 && norm(sugText) === norm(outboundBody);

  const clearedShown = { ...prev };
  delete clearedShown.last_shown_for_message_id;

  if (same) {
    return {
      telemetry: {
        ...clearedShown,
        sent_unchanged_count: prev.sent_unchanged_count + 1,
        last_event: "sent_unchanged",
        last_event_at: now,
      },
      deleteSuggestion: true,
    };
  }
  return {
    telemetry: {
      ...clearedShown,
      sent_edited_count: prev.sent_edited_count + 1,
      last_event: "sent_edited",
      last_event_at: now,
    },
    deleteSuggestion: true,
  };
}
