export type PhoneCallStatus =
  | "unknown"
  | "initiated"
  | "ringing"
  | "in_progress"
  | "completed"
  | "missed"
  | "voicemail"
  | "abandoned"
  | "failed"
  | "cancelled";

function normalizeTwilioToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

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

const SHORT_ABANDONED_MAX_DURATION_SECONDS = 8;

export function refineInboundTwilioCompletedStatus(
  mapped: PhoneCallStatus,
  input: {
    direction: string;
    voicemailRecordingSid: string | null;
    durationSeconds: number | null;
    previousPhoneStatus: string | null;
    answeredBy: string | null;
    dialCallStatus: string | null;
  }
): PhoneCallStatus {
  if (mapped !== "completed") return mapped;
  if (input.direction !== "inbound") return mapped;
  if (input.voicemailRecordingSid && input.voicemailRecordingSid.trim() !== "") return "voicemail";
  const dial = (input.dialCallStatus ?? "").trim().toLowerCase();
  if (dial === "completed") {
    return "completed";
  }
  const prev = (input.previousPhoneStatus ?? "").trim().toLowerCase();
  if (prev === "in_progress") return mapped;
  const ab = (input.answeredBy ?? "").trim().toLowerCase();
  if (ab === "human") return mapped;
  const d = input.durationSeconds;
  if (d == null || !Number.isFinite(d) || d < 0) return mapped;
  if (d <= SHORT_ABANDONED_MAX_DURATION_SECONDS) return "abandoned";
  return "missed";
}

export function guardInboundMissedAfterBridgeSignals(input: {
  phone_calls_id: string;
  refined: PhoneCallStatus;
  direction: string;
  previousPhoneStatus: string | null;
  prevMeta: Record<string, unknown>;
  effectiveDialCallStatus: string | null;
  durationSeconds: number | null;
  voicemailRecordingSid?: string | null;
}): PhoneCallStatus {
  if (input.refined === "voicemail") return "voicemail";
  const vmSid =
    typeof input.voicemailRecordingSid === "string" ? input.voicemailRecordingSid.trim() : "";
  if (vmSid) return "voicemail";
  if (input.refined !== "missed") return input.refined;
  if (input.direction !== "inbound") return input.refined;

  const prev = (input.previousPhoneStatus ?? "").trim().toLowerCase();
  if (prev === "voicemail") return "voicemail";
  if (prev === "completed") return "completed";

  const d = (input.effectiveDialCallStatus ?? "").trim().toLowerCase();
  if (d === "completed") return "completed";

  const lastCb = input.prevMeta.twilio_last_callback;
  const storedDial =
    lastCb && typeof lastCb === "object"
      ? String((lastCb as Record<string, unknown>).DialCallStatus ?? "")
          .trim()
          .toLowerCase()
      : "";
  if (storedDial === "completed") return "completed";

  const legMap = input.prevMeta.twilio_leg_map;
  const hadLeg =
    legMap &&
    typeof legMap === "object" &&
    typeof (legMap as Record<string, unknown>).last_leg_call_sid === "string";
  const dur = input.durationSeconds ?? 0;
  if (hadLeg && (prev === "in_progress" || dur >= 20)) return "completed";

  return input.refined;
}
