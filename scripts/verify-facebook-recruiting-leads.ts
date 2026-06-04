/**
 * Lightweight assertions for Facebook recruiting lead routing + post-create behavior.
 * Run: npm run verify:facebook-recruiting-leads
 */

import assert from "node:assert/strict";

import {
  isFacebookRecruitingLeadPayload,
  normalizeFacebookRecruitingLeadFields,
} from "../src/lib/recruiting/facebook-recruiting-lead-detect";
import {
  buildFacebookRecruitingLeadAdminNotificationBody,
  buildFacebookRecruitingLeadIntroSmsBody,
  extractRecruitingLeadFirstName,
  recruitingLeadAdminNotificationDedupeKey,
  recruitingLeadAdminNotificationHref,
  shouldSendFacebookRecruitingAdminNotification,
  shouldSendFacebookRecruitingIntroSms,
} from "../src/lib/recruiting/facebook-recruiting-lead-shared";
import { normalizeRecruitingPhoneForStorage } from "../src/lib/recruiting/recruiting-contact-normalize";

const examplePayload = {
  form_name: "Hiring Form - Physical Therapy",
  full_name: "Test Lead",
  phone: "4805551234",
  email: "test@example.com",
  license_status: "Yes",
  home_health_experience: "Yes",
  visits_per_week: "10-20 visits",
  coverage_area: "Maricopa County",
  start_date: "Immediately",
  lead_type: "PT Hiring",
  source: "Facebook Lead Form",
};

function testRecruitingDetection() {
  assert.equal(isFacebookRecruitingLeadPayload(examplePayload), true);
  assert.equal(
    isFacebookRecruitingLeadPayload({
      form_name: "Wound Care Lead Form",
      lead_type: "Patient Referral",
    }),
    false
  );
  assert.equal(
    isFacebookRecruitingLeadPayload({
      form_name: "Hiring Form - RN",
    }),
    true
  );
  assert.equal(
    isFacebookRecruitingLeadPayload({
      form_name: "Physical Therapy at Home",
      full_name: "Jane Patient",
      service_needed: "Physical Therapy",
    }),
    false
  );
  assert.equal(isFacebookRecruitingLeadPayload({ form_name: "PT Recruiting Form" }), true);
  assert.equal(isFacebookRecruitingLeadPayload({ form_name: "Home Health Job Application" }), true);
  assert.equal(isFacebookRecruitingLeadPayload({ form_name: "New Applicant Intake" }), true);
  assert.equal(isFacebookRecruitingLeadPayload({ lead_type: "PT Hiring" }), true);
}

function testFieldNormalization() {
  const fields = normalizeFacebookRecruitingLeadFields(examplePayload);
  assert.equal(fields.full_name, "Test Lead");
  assert.equal(fields.phone, "4805551234");
  assert.equal(fields.email, "test@example.com");
  assert.equal(fields.license_status, "Yes");
  assert.equal(fields.home_health_experience, "Yes");
  assert.equal(fields.visits_per_week, "10-20 visits");
  assert.equal(fields.coverage_area, "Maricopa County");
  assert.equal(fields.start_date, "Immediately");
  assert.equal(fields.lead_type, "PT Hiring");
  assert.equal(fields.source, "Facebook Lead Form");
}

function testPhoneNormalization() {
  assert.equal(normalizeRecruitingPhoneForStorage("4805551234"), "4805551234");
  assert.equal(normalizeRecruitingPhoneForStorage("(480) 555-1234"), "4805551234");
  assert.equal(normalizeRecruitingPhoneForStorage("+1 480-555-1234"), "4805551234");
}

function testPatientPayloadNotRecruiting() {
  const patientPayload = {
    form_name: "Wound Care Intake",
    full_name: "Jane Patient",
    phone: "6025559999",
    has_medicare: "Yes",
    service_needed: "Wound Care",
  };
  assert.equal(isFacebookRecruitingLeadPayload(patientPayload), false);
  const fields = normalizeFacebookRecruitingLeadFields(patientPayload);
  assert.equal(fields.full_name, "Jane Patient");
  assert.equal(fields.phone, "6025559999");
}

function testIntroSmsCopy() {
  const body = buildFacebookRecruitingLeadIntroSmsBody(extractRecruitingLeadFirstName("Test Lead"));
  assert.match(body, /^Hi Test,/);
  assert.match(body, /480-360-0008/);
  assert.match(body, /Reply STOP to opt out\./);

  const generic = buildFacebookRecruitingLeadIntroSmsBody(null);
  assert.match(generic, /^Hi, thanks for reaching out/);
}

function testPostCreateGuards() {
  assert.equal(
    shouldSendFacebookRecruitingIntroSms({ created: true, hasPhone: true, autoSmsSentAt: null }),
    true
  );
  assert.equal(
    shouldSendFacebookRecruitingIntroSms({ created: false, hasPhone: true, autoSmsSentAt: null }),
    false
  );
  assert.equal(
    shouldSendFacebookRecruitingIntroSms({ created: true, hasPhone: true, autoSmsSentAt: "2026-01-01T00:00:00.000Z" }),
    false
  );
  assert.equal(
    shouldSendFacebookRecruitingIntroSms({ created: true, hasPhone: false, autoSmsSentAt: null }),
    false
  );

  assert.equal(
    shouldSendFacebookRecruitingAdminNotification({ created: true, lastAdminNotificationSentAt: null }),
    true
  );
  assert.equal(
    shouldSendFacebookRecruitingAdminNotification({ created: false, lastAdminNotificationSentAt: null }),
    false
  );
  assert.equal(
    shouldSendFacebookRecruitingAdminNotification({
      created: true,
      lastAdminNotificationSentAt: "2026-01-01T00:00:00.000Z",
    }),
    false
  );
}

function testAdminNotificationContent() {
  const body = buildFacebookRecruitingLeadAdminNotificationBody({
    fullName: "Test Lead",
    coverageArea: "Maricopa County",
    visitsPerWeek: "10-20 visits",
    startDate: "Immediately",
  });
  assert.match(body, /Test Lead submitted a Facebook PT hiring form\./);
  assert.match(body, /Maricopa County/);
  assert.match(body, /10-20 visits/);
  assert.match(body, /Start: Immediately/);

  const leadId = "11111111-1111-4111-8111-111111111111";
  assert.equal(recruitingLeadAdminNotificationHref(leadId), `/admin/recruiting-leads/${leadId}`);
  assert.equal(recruitingLeadAdminNotificationDedupeKey(leadId), `facebook_recruiting_lead:${leadId}`);
}

function main() {
  testRecruitingDetection();
  testFieldNormalization();
  testPhoneNormalization();
  testPatientPayloadNotRecruiting();
  testIntroSmsCopy();
  testPostCreateGuards();
  testAdminNotificationContent();
  console.log("verify:facebook-recruiting-leads ok");
}

main();
