export const REQUIRED_ONBOARDING_DOCUMENT_TYPES = [
  "resume",
  "drivers_license",
  "fingerprint_clearance_card",
  "social_security_card",
  "cpr_front",
  "tb_test",
] as const;

export const REQUIRED_ONBOARDING_PORTAL_FORM_KEYS = [
  "employee_handbook_ack",
  "conflict_of_interest",
  "electronic_signature_agreement",
  "hepatitis_b_declination",
  "tb_risk_assessment",
] as const;

export type RequiredOnboardingDocumentType =
  (typeof REQUIRED_ONBOARDING_DOCUMENT_TYPES)[number];
export type RequiredOnboardingPortalFormKey =
  (typeof REQUIRED_ONBOARDING_PORTAL_FORM_KEYS)[number];

export type OnboardingPortalFormChecklistItem = {
  key: RequiredOnboardingPortalFormKey;
  label: string;
  complete: boolean;
};

export type OnboardingDocumentChecklistItem = {
  key: RequiredOnboardingDocumentType;
  label: string;
  complete: boolean;
};

export type OnboardingPortalFormsRecord = {
  completed?: boolean | null;
  handbook_acknowledged?: boolean | null;
  conflict_confidentiality_acknowledged?: boolean | null;
  conflict_confidentiality_disclosure?: string | null;
  conflict_confidentiality_full_name?: string | null;
  conflict_confidentiality_signed_at?: string | null;
  electronic_signature_agreement_acknowledged?: boolean | null;
  electronic_signature_agreement_full_name?: string | null;
  electronic_signature_agreement_signed_at?: string | null;
  hep_b_declination_acknowledged?: boolean | null;
  hep_b_declination_full_name?: string | null;
  hep_b_declination_signed_at?: string | null;
  tb_history_positive_test_or_infection?: boolean | null;
  tb_history_bcg_vaccine?: boolean | null;
  tb_symptom_prolonged_recurrent_fever?: boolean | null;
  tb_symptom_recent_weight_loss?: boolean | null;
  tb_symptom_chronic_cough?: boolean | null;
  tb_symptom_coughing_blood?: boolean | null;
  tb_symptom_night_sweats?: boolean | null;
  tb_risk_silicosis?: boolean | null;
  tb_risk_gastrectomy?: boolean | null;
  tb_risk_intestinal_bypass?: boolean | null;
  tb_risk_weight_10_percent_below_ideal?: boolean | null;
  tb_risk_chronic_renal_disease?: boolean | null;
  tb_risk_diabetes_mellitus?: boolean | null;
  tb_risk_steroid_or_immunosuppressive_therapy?: boolean | null;
  tb_risk_hematologic_disorder?: boolean | null;
  tb_risk_exposure_to_hiv_or_aids?: boolean | null;
  tb_risk_other_malignancies?: boolean | null;
  tb_baseline_residence_high_tb_country?: boolean | null;
  tb_baseline_current_or_planned_immunosuppression?: boolean | null;
  tb_baseline_close_contact_with_infectious_tb?: boolean | null;
  tb_additional_comments?: string | null;
  tb_acknowledged?: boolean | null;
  tb_full_name?: string | null;
  tb_signed_at?: string | null;
};

export const ONBOARDING_PORTAL_FORMS_SELECT = `
  completed,
  handbook_acknowledged,
  conflict_confidentiality_acknowledged,
  conflict_confidentiality_disclosure,
  conflict_confidentiality_full_name,
  conflict_confidentiality_signed_at,
  electronic_signature_agreement_acknowledged,
  electronic_signature_agreement_full_name,
  electronic_signature_agreement_signed_at,
  hep_b_declination_acknowledged,
  hep_b_declination_full_name,
  hep_b_declination_signed_at,
  tb_history_positive_test_or_infection,
  tb_history_bcg_vaccine,
  tb_symptom_prolonged_recurrent_fever,
  tb_symptom_recent_weight_loss,
  tb_symptom_chronic_cough,
  tb_symptom_coughing_blood,
  tb_symptom_night_sweats,
  tb_risk_silicosis,
  tb_risk_gastrectomy,
  tb_risk_intestinal_bypass,
  tb_risk_weight_10_percent_below_ideal,
  tb_risk_chronic_renal_disease,
  tb_risk_diabetes_mellitus,
  tb_risk_steroid_or_immunosuppressive_therapy,
  tb_risk_hematologic_disorder,
  tb_risk_exposure_to_hiv_or_aids,
  tb_risk_other_malignancies,
  tb_baseline_residence_high_tb_country,
  tb_baseline_current_or_planned_immunosuppression,
  tb_baseline_close_contact_with_infectious_tb,
  tb_additional_comments,
  tb_acknowledged,
  tb_full_name,
  tb_signed_at
`.trim();

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function getOnboardingPortalFormChecklist(
  record: OnboardingPortalFormsRecord | null | undefined
): OnboardingPortalFormChecklistItem[] {
  const forms = record ?? null;
  const handbookComplete = forms?.handbook_acknowledged === true;
  const conflictComplete =
    forms?.conflict_confidentiality_acknowledged === true &&
    hasText(forms?.conflict_confidentiality_disclosure) &&
    hasText(forms?.conflict_confidentiality_full_name) &&
    hasText(forms?.conflict_confidentiality_signed_at);
  const electronicAgreementComplete =
    forms?.electronic_signature_agreement_acknowledged === true &&
    hasText(forms?.electronic_signature_agreement_full_name) &&
    hasText(forms?.electronic_signature_agreement_signed_at);
  const hepatitisBDeclinationComplete =
    forms?.hep_b_declination_acknowledged === true &&
    hasText(forms?.hep_b_declination_full_name) &&
    hasText(forms?.hep_b_declination_signed_at);
  const tbRiskAssessmentComplete =
    typeof forms?.tb_history_positive_test_or_infection === "boolean" &&
    typeof forms?.tb_history_bcg_vaccine === "boolean" &&
    typeof forms?.tb_symptom_prolonged_recurrent_fever === "boolean" &&
    typeof forms?.tb_symptom_recent_weight_loss === "boolean" &&
    typeof forms?.tb_symptom_chronic_cough === "boolean" &&
    typeof forms?.tb_symptom_coughing_blood === "boolean" &&
    typeof forms?.tb_symptom_night_sweats === "boolean" &&
    typeof forms?.tb_baseline_residence_high_tb_country === "boolean" &&
    typeof forms?.tb_baseline_current_or_planned_immunosuppression === "boolean" &&
    typeof forms?.tb_baseline_close_contact_with_infectious_tb === "boolean" &&
    forms?.tb_acknowledged === true &&
    hasText(forms?.tb_full_name) &&
    hasText(forms?.tb_signed_at);

  return [
    {
      key: "employee_handbook_ack",
      label: "Employee Handbook",
      complete: handbookComplete,
    },
    {
      key: "conflict_of_interest",
      label: "Conflict of Interest + Confidentiality",
      complete: conflictComplete,
    },
    {
      key: "electronic_signature_agreement",
      label: "Electronic Documentation Signature Agreement",
      complete: electronicAgreementComplete,
    },
    {
      key: "hepatitis_b_declination",
      label: "Hepatitis B Vaccine Declination",
      complete: hepatitisBDeclinationComplete,
    },
    {
      key: "tb_risk_assessment",
      label: "TB Risk Assessment",
      complete: tbRiskAssessmentComplete,
    },
  ];
}

export function getOnboardingDocumentChecklist(input: {
  documentKeys: Set<string>;
  resumeUrl?: string | null;
}): OnboardingDocumentChecklistItem[] {
  const hasResume = input.documentKeys.has("resume") || hasText(input.resumeUrl);

  return [
    { key: "resume", label: "Resume", complete: hasResume },
    {
      key: "drivers_license",
      label: "Driver’s License",
      complete: input.documentKeys.has("drivers_license"),
    },
    {
      key: "fingerprint_clearance_card",
      label: "AZ Fingerprint Clearance Card",
      complete: input.documentKeys.has("fingerprint_clearance_card"),
    },
    {
      key: "social_security_card",
      label: "Social Security Card",
      complete: input.documentKeys.has("social_security_card"),
    },
    {
      key: "cpr_front",
      label: "CPR Card",
      complete: input.documentKeys.has("cpr_front"),
    },
    {
      key: "tb_test",
      label: "TB Test",
      complete: input.documentKeys.has("tb_test"),
    },
  ];
}

export function buildOnboardingPortalStatus(input: {
  documentKeys: Set<string>;
  onboardingForms: OnboardingPortalFormsRecord | null | undefined;
  hasLegacyApplicantFileFallback?: boolean;
  resumeUrl?: string | null;
}) {
  const documentItems = getOnboardingDocumentChecklist({
    documentKeys: input.documentKeys,
    resumeUrl: input.resumeUrl,
  });
  const formItems = getOnboardingPortalFormChecklist(input.onboardingForms);
  const documentUploadsComplete =
    input.hasLegacyApplicantFileFallback === true || documentItems.every((item) => item.complete);
  const portalFormsComplete = formItems.every((item) => item.complete);

  return {
    documentItems,
    formItems,
    documentUploadsComplete,
    portalFormsComplete,
    documentsStepComplete: documentUploadsComplete && portalFormsComplete,
    completedDocumentCount: documentItems.filter((item) => item.complete).length,
    completedFormCount: formItems.filter((item) => item.complete).length,
  };
}
