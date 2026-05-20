/** Staff-facing failure text for Move to cell (banner / tooltip). */
export function formatMoveToCellFailureMessage(
  lastError: string | null | undefined,
  twilioCode?: number | string | null
): string {
  const raw = (lastError ?? "").trim();
  const lower = raw.toLowerCase();
  const code =
    twilioCode != null && String(twilioCode).trim() !== ""
      ? String(twilioCode).trim()
      : extractTwilioCode(raw);

  if (lower.includes("missing staff cell") || lower.includes("no staff cell")) {
    return "Failed: missing staff cell number — add sms_notify_phone on your profile.";
  }
  if (lower.includes("twilio_softphone_caller_id") || lower.includes("caller_id")) {
    return "Failed: outbound caller ID not configured (TWILIO_SOFTPHONE_CALLER_ID_E164).";
  }
  if (lower.includes("signing secret")) {
    return "Failed: server signing secret not configured for Move to cell.";
  }
  if (lower.includes("conference not found") || lower.includes("conference_sid")) {
    return "Failed: conference not found or not active anymore.";
  }
  if (lower.includes("participant") && lower.includes("label")) {
    return "Failed: conference participant label conflict.";
  }
  if (lower === "no-answer") {
    return "Failed: cell call no-answer — browser call is still connected.";
  }
  if (lower === "busy") {
    return "Failed: cell line busy — browser call is still connected.";
  }
  if (lower === "canceled" || lower === "cancelled") {
    return "Failed: cell call canceled — browser call is still connected.";
  }
  if (lower === "failed") {
    return "Failed: cell call failed — browser call is still connected.";
  }
  if (lower.includes("press_1") || lower.includes("press 1")) {
    return "Failed: press 1 not received in time — browser call is still connected.";
  }
  if (lower.includes("completed_without_join") || lower.includes("hung up before join")) {
    return "Failed: cell hung up before joining — browser call is still connected.";
  }
  if (lower.includes("invalid") && lower.includes("to")) {
    return "Failed: invalid cell To number.";
  }
  if (lower.includes("invalid") && lower.includes("from")) {
    return "Failed: Twilio rejected From number — check TWILIO_SOFTPHONE_CALLER_ID_E164.";
  }
  if (lower.includes("not authorized") || lower.includes("unauthorized")) {
    return "Failed: Twilio rejected caller ID or account permissions.";
  }
  if (code) {
    const short = raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
    return `Failed: Twilio error ${code}${short ? ` — ${short}` : ""}`;
  }
  if (raw) {
    const short = raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
    return `Failed: ${short} — browser call is still connected.`;
  }
  return "Failed: unknown error — browser call is still connected.";
}

function extractTwilioCode(message: string): string | null {
  const m = message.match(/\b(1\d{4}|2\d{4}|3\d{4}|4\d{4}|5\d{4})\b/);
  return m?.[1] ?? null;
}

/** Normalize webhook / API errors before persisting on move_to_cell.last_error. */
export function moveToCellFailureReason(input: {
  source: string;
  callStatus?: string | null;
  twilioMessage?: string | null;
  twilioCode?: number | string | null;
  detail?: string | null;
}): string {
  const status = (input.callStatus ?? "").trim().toLowerCase();
  if (status === "no-answer") return "cell_call_no_answer";
  if (status === "busy") return "cell_call_busy";
  if (status === "canceled" || status === "cancelled") return "cell_call_canceled";
  if (status === "failed") return "cell_call_failed";
  if (input.source === "press_1") return "press_1_timeout_or_rejected";
  if (input.source === "completed_without_join") return "cell_hung_up_before_join";
  if (input.twilioCode != null) {
    const msg = (input.twilioMessage ?? input.detail ?? "").trim();
    return msg ? `twilio_${input.twilioCode}: ${msg}` : `twilio_${input.twilioCode}`;
  }
  const msg = (input.twilioMessage ?? input.detail ?? input.source).trim();
  return msg || input.source;
}
