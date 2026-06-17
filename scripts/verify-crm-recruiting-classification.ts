/**
 * Assertions for CRM recruiting vs patient lead classification.
 * Run: npm run verify:crm-recruiting-classification
 */

import assert from "node:assert/strict";

import { isCrmRecruitingApplicantLead } from "../src/lib/crm/crm-recruiting-lead-exclusion";

function testEmployeeLeadType() {
  assert.equal(isCrmRecruitingApplicantLead({ lead_type: "employee" }), true);
  assert.equal(isCrmRecruitingApplicantLead({ lead_type: "recruiting" }), true);
}

function testEmploymentMetadata() {
  assert.equal(
    isCrmRecruitingApplicantLead({
      external_source_metadata: {
        employment_application: { position: "RN" },
      },
    }),
    true
  );
  assert.equal(
    isCrmRecruitingApplicantLead({
      external_source_metadata: { pipeline: "recruiting" },
    }),
    true
  );
}

function testWeakSignalsDoNotClassify() {
  assert.equal(
    isCrmRecruitingApplicantLead({
      source: "other",
      notes: "Home health nurse referral from hospital",
    }),
    false
  );
  assert.equal(
    isCrmRecruitingApplicantLead({
      source: "legacy_crm_lead",
      notes: "Patient needs skilled nursing",
    }),
    false
  );
}

function testPatientIndicatorsOverrideWeakSignals() {
  assert.equal(
    isCrmRecruitingApplicantLead({
      source: "hospital",
      notes: "RN referral for home health patient",
      referral_source: "Banner Hospital",
      payer_name: "Medicare",
    }),
    false
  );
  assert.equal(
    isCrmRecruitingApplicantLead({
      source: "other",
      notes: "Licensed therapist mentioned in conversation",
      service_type: "Physical Therapy",
      referring_doctor_name: "Dr. Smith",
    }),
    false
  );
}

function testRestoredPatientLeadsExcluded() {
  assert.equal(
    isCrmRecruitingApplicantLead({
      source: "restored_from_recruiting_misclassification",
      external_source_metadata: {
        restored_from_recruiting: true,
        employment_application: { position: "RN" },
      },
    }),
    false
  );
}

function testWebsiteCareersSource() {
  assert.equal(
    isCrmRecruitingApplicantLead({
      source: "website",
      external_source_metadata: {
        employment_application: { position: "PT" },
      },
    }),
    true
  );
}

function main() {
  testEmployeeLeadType();
  testEmploymentMetadata();
  testWeakSignalsDoNotClassify();
  testPatientIndicatorsOverrideWeakSignals();
  testRestoredPatientLeadsExcluded();
  testWebsiteCareersSource();
  console.log("verify:crm-recruiting-classification ok");
}

main();
