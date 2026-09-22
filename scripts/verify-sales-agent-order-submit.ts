/**
 * Sales-agent order submit: card photos must not ride along in the create-lead
 * request, and a complete text payload still passes validation without them.
 *
 * Run: npx tsx scripts/verify-sales-agent-order-submit.ts
 */
import assert from "node:assert/strict";

import { formDataWithoutFiles } from "../src/lib/sales-agent/sales-agent-order-photos";
import {
  salesAgentCreateLeadValidationMessage,
  validateSalesAgentCreateLeadFormData,
} from "../src/lib/sales-agent/sales-agent-create-lead-validation";

function orderFields(): FormData {
  const fd = new FormData();
  fd.set("patient_name", "Example Patient");
  fd.set("address", "601 E Westchester Dr, Tempe, AZ 85283");
  fd.set("phone_number", "6025550100");
  fd.set("date_of_birth", "1955-11-26");
  fd.set("insurance_name", "UnitedHealthcare Advantage");
  fd.set("doctor_or_pcp_name", "Example Clinician");
  fd.set("doctor_or_pcp_phone", "6025550199");
  fd.set("consent_to_contact", "on");
  fd.set(
    "insurance_card_front",
    new File([new Uint8Array(5 * 1024 * 1024)], "card.jpg", { type: "image/jpeg" })
  );
  return fd;
}

const withPhoto = orderFields();
const textOnly = formDataWithoutFiles(withPhoto);

assert.equal(textOnly.get("insurance_card_front"), null);
assert.equal(textOnly.get("patient_name"), "Example Patient");
assert.equal(textOnly.get("phone_number"), "6025550100");
assert.equal(textOnly.get("insurance_name"), "UnitedHealthcare Advantage");

const ok = validateSalesAgentCreateLeadFormData(textOnly);
assert.equal(ok.ok, true);

const missingConsent = formDataWithoutFiles(orderFields());
missingConsent.delete("consent_to_contact");
const consent = validateSalesAgentCreateLeadFormData(missingConsent);
assert.equal(consent.ok, false);
if (!consent.ok) {
  assert.equal(consent.code, "validation_consent");
  assert.equal(salesAgentCreateLeadValidationMessage(consent.code), "Consent to contact is required.");
}

const missingInsurance = formDataWithoutFiles(orderFields());
missingInsurance.delete("insurance_name");
const insurance = validateSalesAgentCreateLeadFormData(missingInsurance);
assert.equal(insurance.ok, false);
if (!insurance.ok) {
  assert.equal(insurance.code, "validation_insurance");
}

console.log("verify-sales-agent-order-submit: ok");
