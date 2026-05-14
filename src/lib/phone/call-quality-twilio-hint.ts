import { normalizePhone } from "@/lib/phone/us-phone-format";

export type CallQualityAnsweredBy = "browser" | "mobile_forward" | "unknown";

export type TwilioLegQualityHint = {
  received_at: string;
  reporting_call_sid: string | null;
  parent_call_sid: string | null;
  call_status: string | null;
  dial_call_status: string | null;
  direction: string | null;
  to_raw: string | null;
  from_raw: string | null;
  to_kind: "client" | "e164" | "other";
};

const MAX_TWILIO_LEG_HINTS = 25;

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function classifyToKind(toRaw: string | null | undefined): "client" | "e164" | "other" {
  const t = (toRaw ?? "").trim().toLowerCase();
  if (t.startsWith("client:")) return "client";
  if (normalizePhone(t).length >= 10) return "e164";
  return "other";
}

/**
 * Builds a compact leg hint from Twilio voice status callback form fields.
 * Child Dial legs include `To` as either `client:…` (browser/WebRTC) or an E.164 PSTN target (often cell forward).
 */
export function buildTwilioLegQualityHint(raw: Record<string, string>): TwilioLegQualityHint | null {
  const reporting = (raw.CallSid ?? "").trim() || null;
  const parent = (raw.ParentCallSid ?? "").trim() || null;
  const dialCallStatus = (raw.DialCallStatus ?? "").trim() || null;
  const toRaw = (raw.To ?? "").trim() || null;
  const fromRaw = (raw.From ?? "").trim() || null;
  const callStatus = (raw.CallStatus ?? "").trim() || null;
  const direction = (raw.Direction ?? "").trim() || null;
  const toKind = classifyToKind(toRaw);

  if (!reporting) return null;
  /**
   * Drop the first PSTN leg to the Twilio DID (no ParentCallSid, no DialCallStatus) — `To` is our number, not staff pickup.
   * Keep: `client:…` rings, any `<Dial>` child (`ParentCallSid` / `DialCallStatus`), or bridged edge cases.
   */
  const fromIsClient = (fromRaw ?? "").trim().toLowerCase().startsWith("client:");
  const include =
    toKind === "client" || fromIsClient || Boolean(dialCallStatus) || Boolean(parent);
  if (!include) {
    return null;
  }

  return {
    received_at: new Date().toISOString(),
    reporting_call_sid: reporting,
    parent_call_sid: parent,
    call_status: callStatus,
    dial_call_status: dialCallStatus || null,
    direction,
    to_raw: toRaw,
    from_raw: fromRaw,
    to_kind: toKind,
  };
}

export function inferAnsweredByFromLegHints(hints: TwilioLegQualityHint[]): CallQualityAnsweredBy {
  if (!hints.length) return "unknown";
  const interesting = [...hints].reverse();
  for (const h of interesting) {
    const dial = (h.dial_call_status ?? "").trim().toLowerCase();
    const cs = (h.call_status ?? "").trim().toLowerCase();
    const active =
      dial === "answered" ||
      dial === "completed" ||
      cs === "in-progress" ||
      cs === "completed" ||
      cs === "ringing";
    if (!active) continue;
    if (h.to_kind === "client") return "browser";
    if (h.to_kind === "e164") return "mobile_forward";
  }
  for (const h of interesting) {
    if (h.to_kind === "client") return "browser";
    if (h.to_kind === "e164") return "mobile_forward";
  }
  return "unknown";
}

function hintsEqual(a: TwilioLegQualityHint, b: TwilioLegQualityHint): boolean {
  return (
    a.reporting_call_sid === b.reporting_call_sid &&
    a.call_status === b.call_status &&
    a.dial_call_status === b.dial_call_status &&
    a.to_raw === b.to_raw &&
    a.from_raw === b.from_raw
  );
}

/**
 * Merges Twilio leg hints into `phone_calls.metadata.call_quality` without disturbing other metadata keys.
 */
export function mergePhoneCallMetadataWithTwilioLegHint(
  prevMetadata: Record<string, unknown>,
  raw: Record<string, string>
): Record<string, unknown> {
  const hint = buildTwilioLegQualityHint(raw);
  if (!hint) {
    return prevMetadata;
  }

  const prevCq = asRecord(prevMetadata.call_quality);
  const prevHintsRaw = prevCq.twilio_leg_hints;
  const prevHints: TwilioLegQualityHint[] = Array.isArray(prevHintsRaw)
    ? prevHintsRaw.filter((x): x is TwilioLegQualityHint => x && typeof x === "object")
    : [];

  const last = prevHints[prevHints.length - 1];
  if (last && hintsEqual(last, hint)) {
    return prevMetadata;
  }

  const nextHints = [...prevHints, hint].slice(-MAX_TWILIO_LEG_HINTS);
  const answeredBy = inferAnsweredByFromLegHints(nextHints);

  const nextCq = {
    ...prevCq,
    twilio_leg_hints: nextHints,
    answered_by_inferred: answeredBy,
  };

  return {
    ...prevMetadata,
    call_quality: nextCq,
  };
}

/**
 * When browser diagnostics say the call was answered in-browser but Twilio hints suggest a PSTN leg won, log once.
 */
export function maybeLogCallQualityPathMismatch(
  prevMetadata: Record<string, unknown>,
  answeredByInferred: CallQualityAnsweredBy
): void {
  const prevCq = asRecord(prevMetadata.call_quality);
  const reports = prevCq.client_browser_reports;
  if (!Array.isArray(reports) || reports.length === 0) return;
  const last = reports[reports.length - 1] as Record<string, unknown>;
  const ab = typeof last.answered_by === "string" ? last.answered_by.trim() : "";
  if (ab !== "browser") return;
  if (answeredByInferred !== "mobile_forward") return;
  console.warn(
    "[call-quality]",
    JSON.stringify({
      event: "answered_path_mismatch",
      client_said: "browser",
      twilio_inferred: answeredByInferred,
      hint:
        "Staff may have the Saintly mobile app and browser registered on the same Twilio Client identity — pickup can race. Compare client_browser_reports vs twilio_leg_hints on this phone_calls row.",
    })
  );
}
