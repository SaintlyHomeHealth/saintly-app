/**
 * Lightweight assertions for inbound-email helpers (no Jest/Vitest in repo).
 * Run: npx tsx scripts/verify-inbound-email-helpers.ts
 */

import assert from "node:assert/strict";

import { resolveInboundChannelFromToEmails } from "../src/lib/inbound-email/alias-routing";
import {
  extractDisplayNameFromFromHeader,
  extractPhoneNumbersFromText,
  maybeExtractSimplePersonNameFromSubjectOrBody,
} from "../src/lib/inbound-email/extract";
import {
  normalizeDefaultInboundEmail,
  normalizeMailgunInboundEmail,
  normalizeResendInboundEmail,
  normalizeSendgridInboundEmail,
} from "../src/lib/inbound-email/normalize-providers";

function testAliasRouting() {
  assert.equal(
    resolveInboundChannelFromToEmails(["Referrals <referrals@saintlyhomehealth.com>"]),
    "referrals"
  );
  assert.equal(resolveInboundChannelFromToEmails(["care@saintlyhomehealth.com"]), "care");
  assert.equal(resolveInboundChannelFromToEmails(["join@saintlyhomehealth.com"]), "join");
  assert.equal(resolveInboundChannelFromToEmails(["billing@saintlyhomehealth.com"]), "billing");
  assert.equal(resolveInboundChannelFromToEmails(["other@example.com"]), null);
}

function testExtract() {
  const { email, name } = extractDisplayNameFromFromHeader('Jane Doe <jane@example.com>');
  assert.equal(email, "jane@example.com");
  assert.equal(name, "Jane Doe");

  const phones = extractPhoneNumbersFromText("Call 480-555-1212 or (602) 555-9999");
  assert.ok(phones.length >= 1);

  const n = maybeExtractSimplePersonNameFromSubjectOrBody("Referral", "Patient: Maria Garcia\n\nThanks");
  assert.equal(n, "Maria Garcia");
}

function testNormalizeDefault() {
  const n = normalizeDefaultInboundEmail(
    {
      fromEmail: "a@b.com",
      toEmails: ["care@saintlyhomehealth.com"],
      subject: "Hi",
    },
    "test"
  );
  assert.equal(n.fromEmail, "a@b.com");
  assert.ok(n.receivedAt);
}

function testNormalizeProviders() {
  const resend = normalizeResendInboundEmail({
    type: "email.received",
    data: {
      from: "X <x@y.com>",
      to: ["referrals@saintlyhomehealth.com"],
      subject: "S",
      text: "Body",
      email_id: "resend-1",
    },
  });
  assert.equal(resend.provider, "resend");
  assert.equal(resend.messageId, "resend-1");

  const sg = normalizeSendgridInboundEmail({
    from: "a@b.com",
    to: "care@saintlyhomehealth.com",
    subject: "Q",
    text: "T",
    headers: "Message-ID: <sg-1@sendgrid>\n",
  });
  assert.ok(sg.messageId?.includes("sg-1"));

  const mg = normalizeMailgunInboundEmail({
    sender: "s@t.com",
    recipient: "join@saintlyhomehealth.com",
    subject: "Job",
    "body-plain": "Hello",
  });
  assert.equal(mg.toEmails[0], "join@saintlyhomehealth.com");
}

testAliasRouting();
testExtract();
testNormalizeDefault();
testNormalizeProviders();

console.log("verify-inbound-email-helpers: all assertions passed");
