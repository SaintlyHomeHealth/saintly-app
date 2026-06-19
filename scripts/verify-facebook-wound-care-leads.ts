/**
 * Lightweight assertions for Facebook wound-care partner lead normalization.
 * Run: npm run verify:facebook-wound-care-leads
 */

import assert from "node:assert/strict";

import {
  buildFacebookWoundCareLeadNotes,
  FACEBOOK_WOUND_CARE_ZAPIER_EXAMPLE_PAYLOAD,
  normalizeFacebookPartnerWebhookBody,
  normalizedToPartnerPayload,
} from "../src/lib/facebook/facebook-partner-lead-normalize";
import { parseFacebookWoundCareLeadAnswers } from "../src/lib/facebook/facebook-wound-care-lead-display";
import { buildLeadIntakeRequestFromFieldMap } from "../src/lib/crm/lead-intake-request";
import { isFacebookRecruitingLeadPayload } from "../src/lib/recruiting/facebook-recruiting-lead-detect";

function testExamplePayloadNormalization() {
  const norm = normalizeFacebookPartnerWebhookBody({ ...FACEBOOK_WOUND_CARE_ZAPIER_EXAMPLE_PAYLOAD });
  assert.equal(norm.full_name, "Jane Doe");
  assert.equal(norm.phone, "4805551234");
  assert.equal(norm.email, "test@example.com");
  assert.equal(norm.city, "Mesa");
  assert.equal(norm.insurance_answer, "Medicare");
  assert.equal(norm.wound_care_needed, "Open wound / pressure sore");
  assert.equal(norm.care_for, "My parent");
  assert.equal(norm.source, "Facebook Wound Care Ad");
  assert.equal(norm.lead_type, "wound_care");
  assert.equal(norm.service_needed, "Wound Care");
}

function testDefaults() {
  const norm = normalizeFacebookPartnerWebhookBody({
    phone_number: "4805551234",
  });
  assert.equal(norm.full_name, "Facebook Lead");
  assert.equal(norm.source, "Facebook Wound Care Ad");
}

function testLegacyAliases() {
  const norm = normalizeFacebookPartnerWebhookBody({
    name: "Legacy Name",
    phone: "4805559999",
    "Has Medicare": "Yes",
    "Wound Type": "Diabetic ulcer",
    "care for": "Myself",
  });
  assert.equal(norm.full_name, "Legacy Name");
  assert.equal(norm.phone, "4805559999");
  assert.equal(norm.insurance_answer, "Yes");
  assert.equal(norm.wound_type, "Diabetic ulcer");
  assert.equal(norm.care_for, "Myself");
}

function testNotesFormat() {
  const notes = buildFacebookWoundCareLeadNotes({
    insurance_answer: "Medicare",
    wound_care_needed: "Open wound / pressure sore",
    care_for: "My parent",
    source: "Facebook Wound Care Ad",
  });
  assert.match(notes, /Facebook Wound Care Lead/);
  assert.match(notes, /Insurance: Medicare/);
  assert.match(notes, /Wound care needed: Open wound \/ pressure sore/);
  assert.match(notes, /Care for: My parent/);
  assert.match(notes, /Source: Facebook Wound Care Ad/);
  assert.doesNotMatch(notes, /_1|_2|_3/);
}

function testPartnerPayloadMapping() {
  const norm = normalizeFacebookPartnerWebhookBody({ ...FACEBOOK_WOUND_CARE_ZAPIER_EXAMPLE_PAYLOAD });
  const payload = normalizedToPartnerPayload(norm);
  assert.equal(payload.full_name, "Jane Doe");
  assert.equal(payload.phone, "4805551234");
  assert.equal(payload.insurance_answer, "Medicare");
  assert.equal(payload.wound_care_needed, "Open wound / pressure sore");
  assert.equal(payload.lead_type, "wound_care");
}

function testIntakeRequestFieldMap() {
  const payload = normalizedToPartnerPayload(
    normalizeFacebookPartnerWebhookBody({ ...FACEBOOK_WOUND_CARE_ZAPIER_EXAMPLE_PAYLOAD })
  );
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "string" && v.trim()) map.set(k, v.trim());
  }
  map.set("wound_type", String(payload.wound_care_needed));
  map.set("insurance_answer", String(payload.insurance_answer));
  const intake = buildLeadIntakeRequestFromFieldMap(map);
  assert.equal(intake.insurance_answer, "Medicare");
  assert.equal(intake.wound_type, "Open wound / pressure sore");
  assert.equal(intake.care_for, "My parent");
}

function testDisplayParsing() {
  const notes = buildFacebookWoundCareLeadNotes({
    insurance_answer: "Medicare",
    wound_care_needed: "Open wound / pressure sore",
    care_for: "My parent",
    source: "Facebook Wound Care Ad",
  });
  const parsed = parseFacebookWoundCareLeadAnswers({
    source: "facebook_lead_ads",
    notes,
    referral_source: "Facebook Wound Care Ad",
    contact_city: "Mesa",
  });
  assert.ok(parsed);
  assert.equal(parsed!.insurance, "Medicare");
  assert.equal(parsed!.woundCareNeeded, "Open wound / pressure sore");
  assert.equal(parsed!.careFor, "My parent");
  assert.equal(parsed!.city, "Mesa");
}

function testWoundCareNotRecruiting() {
  assert.equal(
    isFacebookRecruitingLeadPayload({
      ...FACEBOOK_WOUND_CARE_ZAPIER_EXAMPLE_PAYLOAD,
    }),
    false
  );
}

function main() {
  testExamplePayloadNormalization();
  testDefaults();
  testLegacyAliases();
  testNotesFormat();
  testPartnerPayloadMapping();
  testIntakeRequestFieldMap();
  testDisplayParsing();
  testWoundCareNotRecruiting();
  console.log("verify:facebook-wound-care-leads — all assertions passed");
}

main();
