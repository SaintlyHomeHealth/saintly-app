/**
 * Regression checks for Employee Handbook Acknowledgement onboarding keys/completion.
 * Run: npx tsx scripts/verify-employee-handbook-acknowledgement.ts
 */

import assert from "node:assert/strict";

import {
  EMPLOYEE_HANDBOOK_ACKNOWLEDGEMENT_KEY,
  isEmployeeHandbookAcknowledgementComplete,
  isEmployeeHandbookAcknowledgementDocumentKey,
  normalizeEmployeeHandbookAcknowledgementKey,
} from "../src/lib/onboarding/employee-handbook-acknowledgement";
import {
  buildOnboardingPortalStatus,
  getOnboardingPortalFormChecklist,
} from "../src/lib/onboarding/portal-documents-status";

function testKeyNormalization() {
  const aliases = [
    "employee_handbook",
    "employee_handbook_ack",
    "employee_handbook_acknowledgment",
    "handbook_acknowledgement",
    "handbook_ack",
    "handbook",
    "Employee Handbook Acknowledgement",
  ];

  for (const alias of aliases) {
    assert.equal(
      normalizeEmployeeHandbookAcknowledgementKey(alias),
      EMPLOYEE_HANDBOOK_ACKNOWLEDGEMENT_KEY
    );
    assert.equal(isEmployeeHandbookAcknowledgementDocumentKey(alias), true);
  }
}

function testCompletionLogic() {
  assert.equal(isEmployeeHandbookAcknowledgementComplete(null), false);
  assert.equal(
    isEmployeeHandbookAcknowledgementComplete({ handbook_acknowledged: false }),
    false
  );

  assert.equal(
    isEmployeeHandbookAcknowledgementComplete({
      handbook_acknowledged: true,
      handbook_full_name: "Jane Doe",
      handbook_signed_at: "2026-07-01T12:00:00.000Z",
    }),
    true
  );

  assert.equal(
    isEmployeeHandbookAcknowledgementComplete({
      handbook_acknowledged: true,
    }),
    true,
    "legacy contracts checkbox-only records should still count"
  );
}

function testPortalChecklistUsesCanonicalKey() {
  const incomplete = getOnboardingPortalFormChecklist({
    handbook_acknowledged: false,
  });
  const handbookItem = incomplete.find(
    (item) => item.key === EMPLOYEE_HANDBOOK_ACKNOWLEDGEMENT_KEY
  );
  assert.ok(handbookItem, "checklist must include handbook acknowledgement item");
  assert.equal(handbookItem.complete, false);
  assert.equal(handbookItem.label, "Employee Handbook Acknowledgement");

  const complete = buildOnboardingPortalStatus({
    documentKeys: new Set(),
    onboardingForms: {
      handbook_acknowledged: true,
      handbook_full_name: "Jane Doe",
      handbook_signed_at: "2026-07-01T12:00:00.000Z",
      conflict_confidentiality_acknowledged: true,
      conflict_confidentiality_disclosure: "None",
      conflict_confidentiality_full_name: "Jane Doe",
      conflict_confidentiality_signed_at: "2026-07-01T12:00:00.000Z",
      electronic_signature_agreement_acknowledged: true,
      electronic_signature_agreement_full_name: "Jane Doe",
      electronic_signature_agreement_signed_at: "2026-07-01T12:00:00.000Z",
      hep_b_declination_acknowledged: true,
      hep_b_declination_full_name: "Jane Doe",
      hep_b_declination_signed_at: "2026-07-01T12:00:00.000Z",
      tb_history_positive_test_or_infection: false,
      tb_history_bcg_vaccine: false,
      tb_symptom_prolonged_recurrent_fever: false,
      tb_symptom_recent_weight_loss: false,
      tb_symptom_chronic_cough: false,
      tb_symptom_coughing_blood: false,
      tb_symptom_night_sweats: false,
      tb_baseline_residence_high_tb_country: false,
      tb_baseline_current_or_planned_immunosuppression: false,
      tb_baseline_close_contact_with_infectious_tb: false,
      tb_acknowledged: true,
      tb_full_name: "Jane Doe",
      tb_signed_at: "2026-07-01T12:00:00.000Z",
    },
  });

  assert.equal(
    complete.formItems.find((item) => item.key === EMPLOYEE_HANDBOOK_ACKNOWLEDGEMENT_KEY)
      ?.complete,
    true
  );
  assert.equal(
    complete.formItems.some((item) => item.key === ("employee_handbook_ack" as never)),
    false,
    "legacy checklist key must not remain"
  );
}

function main() {
  testKeyNormalization();
  testCompletionLogic();
  testPortalChecklistUsesCanonicalKey();
  console.log("verify-employee-handbook-acknowledgement: all checks passed");
}

main();
