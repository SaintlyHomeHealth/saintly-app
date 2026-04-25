/**
 * Verification (no Jest): constants, env normalization, and thread backup preference flag.
 * Run: `npm run verify:sms-senders` (Node 20+ with --experimental-strip-types) or
 *      `node --experimental-strip-types scripts/verify-sms-sender-defaults.mts`
 *
 * Expected outcomes in production: Facebook intro, lead/workspace/admin replies, onboarding invite SMS,
 * staff/credential/temp password SMS, and patient/ops SMS all use `sendSms`, which defaults to
 * +14803600008 unless `fromOverride` / Messaging Service is set. The backup line logs
 * "ALT SMS sender used intentionally" when used as the REST `From` E.164.
 */
import assert from "node:assert/strict";

import {
  getBackupSmsFromNumber,
  getPrimarySmsFromNumber,
  isSaintlyBackupSmsE164,
  isSaintlyPrimarySmsE164,
  SAINTLY_BACKUP_SMS_E164,
  SAINTLY_PRIMARY_SMS_E164,
  resolveDefaultTwilioSmsFromOrMsid,
  shouldHonorThreadPreferredFromE164,
} from "../src/lib/twilio/sms-from-numbers.ts";

const primary = getPrimarySmsFromNumber();
assert.equal(primary.e164, "+14803600008");
assert.equal(primary.nanpDisplay, "(480) 360-0008");

const backup = getBackupSmsFromNumber();
assert.equal(backup.e164, "+14805712062");
assert.equal(backup.nanpDisplay, "(480) 571-2062");

assert.equal(SAINTLY_PRIMARY_SMS_E164, "+14803600008");
assert.equal(SAINTLY_BACKUP_SMS_E164, "+14805712062");

assert.ok(isSaintlyPrimarySmsE164("+14803600008"));
assert.ok(isSaintlyBackupSmsE164("+14805712062"));
assert.ok(!isSaintlyBackupSmsE164("+14803600008"));

// `facebook-lead-intro-sms.ts` FACEBOOK_LEAD_INTRO_SMS_FROM_DEFAULT must remain the primary long code.
const saved = { ...process.env };
try {
  delete process.env.TWILIO_SMS_FROM;
  assert.match(resolveDefaultTwilioSmsFromOrMsid(), /^\+14803600008$/);
  process.env.TWILIO_SMS_FROM = "+14805712062";
  assert.match(resolveDefaultTwilioSmsFromOrMsid(), /^\+14803600008$/);
  process.env.TWILIO_SMS_FROM = "MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.equal(resolveDefaultTwilioSmsFromOrMsid(), "MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
} finally {
  process.env.TWILIO_SMS_FROM = saved.TWILIO_SMS_FROM;
}

assert.equal(shouldHonorThreadPreferredFromE164("+14805712062", {}), false);
assert.equal(shouldHonorThreadPreferredFromE164("+14805712062", { sms_outbound_from_explicit: true }), true);
assert.equal(shouldHonorThreadPreferredFromE164("+14803600008", {}), true);

console.log("verify-sms-sender-defaults: OK");
