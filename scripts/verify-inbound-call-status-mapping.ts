/**
 * Assert inbound call status / disposition mapping for Twilio callbacks.
 * Run: npm run verify:inbound-call-status
 */
import {
  guardInboundMissedAfterBridgeSignals,
  mapTwilioStatusToPhoneStatus,
  refineInboundTwilioCompletedStatus,
  type PhoneCallStatus,
} from "../src/lib/phone/twilio-call-status-map.ts";
import { isTwilioDialLegBridged } from "../src/lib/phone/twilio-dial-leg-bridge.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

function map(input: {
  callStatus: string;
  dialCallStatus?: string | null;
  answeredBy?: string | null;
}): PhoneCallStatus {
  return mapTwilioStatusToPhoneStatus(input);
}

assert(map({ callStatus: "in-progress", dialCallStatus: "answered" }) === "in_progress", "dial answered → in_progress");
assert(map({ callStatus: "completed", dialCallStatus: "completed" }) === "completed", "dial completed → completed");
assert(map({ callStatus: "completed", dialCallStatus: "no-answer" }) === "missed", "dial no-answer → missed");
assert(map({ callStatus: "no-answer" }) === "missed", "call no-answer → missed");
assert(map({ callStatus: "failed" }) === "failed", "call failed → failed");

const bridgedCompleted = refineInboundTwilioCompletedStatus("completed", {
  direction: "inbound",
  voicemailRecordingSid: null,
  durationSeconds: 120,
  previousPhoneStatus: "in_progress",
  answeredBy: null,
  dialCallStatus: "completed",
});
assert(bridgedCompleted === "completed", "in_progress + dial completed stays completed");

const shortAbandon = refineInboundTwilioCompletedStatus("completed", {
  direction: "inbound",
  voicemailRecordingSid: null,
  durationSeconds: 3,
  previousPhoneStatus: "ringing",
  answeredBy: null,
  dialCallStatus: null,
});
assert(shortAbandon === "abandoned", "short inbound completed → abandoned");

const guarded = guardInboundMissedAfterBridgeSignals({
  phone_calls_id: "test",
  refined: "missed",
  direction: "inbound",
  previousPhoneStatus: "in_progress",
  prevMeta: { twilio_last_callback: { DialCallStatus: "completed" } },
  effectiveDialCallStatus: "no-answer",
  durationSeconds: 45,
  voicemailRecordingSid: null,
});
assert(guarded === "completed", "answered in_progress must not downgrade to missed on child no-answer");

assert(
  isTwilioDialLegBridged({
    DialCallStatus: "completed",
    To: "client:saintly_00000000-0000-4000-8000-000000000001",
    DialCallDuration: "0",
  }),
  "browser client completed → bridged even with 0s duration"
);
assert(
  !isTwilioDialLegBridged({
    DialCallStatus: "completed",
    To: "+15551234567",
    DialCallDuration: "2",
  }),
  "PSTN completed under 5s → not bridged (voicemail screening guard)"
);
assert(
  isTwilioDialLegBridged({
    DialCallStatus: "completed",
    To: "+15551234567",
    DialCallDuration: "8",
  }),
  "PSTN completed over 5s → bridged"
);

console.log("verify-inbound-call-status-mapping: OK");
