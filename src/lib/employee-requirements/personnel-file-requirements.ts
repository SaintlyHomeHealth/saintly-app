/**
 * PERSONNEL FILE / HIRING REQUIREMENTS — SOURCE OF TRUTH
 *
 * All admin “personnel file audit”, “survey ready”, and credential requirement logic
 * should derive from `getRequiredCredentialTypesForApplicant` (in `@/lib/admin/employee-directory-data`)
 * plus document key normalization here. Do not add parallel hardcoded discipline lists on the
 * employee detail page — extend the functions in this module or employee-directory-data instead.
 */

import type { ApplicantRoleFields } from "@/lib/applicant-role-for-compliance";
import type { EmployeeDetailWorkAreaTab } from "@/lib/employee-requirements/employee-detail-work-areas";
import { inferContractRoleFromText, type ContractRoleKey } from "@/lib/employee-contracts";

/**
 * When `employee_contracts.role_key` is missing (early onboarding), infer the same
 * `ContractRoleKey` used for contracts so credential requirements stay aligned with HHA/RN/etc.
 */
export function inferContractRoleKeyFromApplicantFields(fields: ApplicantRoleFields): ContractRoleKey | "" {
  const merged = mergeApplicantRoleHints(fields);
  const parts = Object.values(fields)
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const text of [merged, ...parts]) {
    const t = text.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    candidates.push(t);
  }
  for (const text of candidates) {
    const rk = inferContractRoleFromText(text);
    if (rk) return rk;
  }
  return "";
}

/** Matches `employee_credentials.credential_type` normalization (directory + admin detail). */
export function normalizeCredentialTypeKey(type: string | null | undefined): string {
  const t = (type || "").toLowerCase().trim();
  if (t === "cpr" || t === "cpr_card" || t === "cpr_bls" || t === "bls_cpr") {
    return "cpr";
  }
  if (
    t === "fingerprint_clearance_card" ||
    t === "fingerprint_card" ||
    t === "az_fingerprint_clearance_card"
  ) {
    return "fingerprint_clearance_card";
  }
  if (t === "insurance") return "independent_contractor_insurance";
  return t;
}

export function mergeApplicantRoleHints(fields: ApplicantRoleFields): string {
  const parts: string[] = [];
  for (const [, raw] of Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) {
    const s = String(raw ?? "").toLowerCase().trim();
    if (s) parts.push(s);
  }
  return parts.join(" ");
}

/** Pull every known role-ish column from a raw applicants row (`select *`). */
export function buildApplicantRoleFieldsFromRecord(record: Record<string, unknown>): ApplicantRoleFields {
  const s = (key: string) => {
    const v = record[key];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  };
  return {
    position: s("position"),
    primary_discipline: s("primary_discipline"),
    type_of_position: s("type_of_position"),
    position_applied: s("position_applied"),
    discipline: s("discipline"),
    job_title: s("job_title"),
    title: s("title"),
    role: s("role"),
    role_title: s("role_title"),
  };
}

/** Lighter onboarding + file checklist for sales-facing roles (see product spec). */
export function isSalesAgentComplianceBand(mergedRoleHint: string): boolean {
  const s = mergedRoleHint.toLowerCase();
  return (
    s.includes("sales agent") ||
    s.includes("sales-agent") ||
    s.includes("sales representative") ||
    s.includes("account executive") ||
    (s.includes("sales") && (s.includes("agent") || s.includes("representative")))
  );
}

/** Home-health / caregiver disciplines (HHA, certified caregiver, CNA, etc.). */
export function isCaregiverFamilyRole(mergedRoleHint: string): boolean {
  const s = mergedRoleHint.toLowerCase();
  return (
    s.includes("caregiver") ||
    s.includes("hha") ||
    s.includes("cna") ||
    s.includes("home health aide") ||
    s.includes("home health") ||
    s.includes("home-health") ||
    s.includes("personal care") ||
    s.includes("pca") ||
    s.includes("chha") ||
    s.includes("certified nursing assistant") ||
    s.includes("nursing assistant") ||
    s.includes("dsp") ||
    s.includes("direct support")
  );
}

/**
 * Canonical keys for applicant `documents` rows, `applicant_files`, and admin uploads.
 * Keeps onboarding uploads and admin uploads on the same membership test.
 */
export function normalizePersonnelFileDocumentKey(type: string | null | undefined): string {
  const raw = String(type ?? "").toLowerCase().trim();
  const t = raw.replace(/[\s-]+/g, "_");

  if (
    t === "cpr" ||
    t === "cpr_card" ||
    t === "cpr_bls" ||
    t === "bls_cpr" ||
    t === "cpr_front" ||
    t === "cpr_back"
  ) {
    return "cpr_front";
  }
  if (t === "drivers_license" || t === "driver_license" || t === "driverslicense" || t === "dl") {
    return "drivers_license";
  }
  if (
    t === "auto_insurance" ||
    t === "insurance_card" ||
    t === "vehicle_insurance" ||
    t === "car_insurance"
  ) {
    return "auto_insurance";
  }
  if (
    t === "fingerprint_clearance_card" ||
    t === "fingerprint_card" ||
    t === "az_fingerprint_clearance_card" ||
    t === "fingerprint"
  ) {
    return "fingerprint_clearance_card";
  }
  /** Clinical professional licenses (PT, OT, RN, ST, MSW, etc.) — match upload keys like OIG aliases. */
  if (
    t === "professional_license" ||
    t === "professionallicense" ||
    t === "professional_license_card" ||
    t === "professional_licensure" ||
    t === "license" ||
    t === "licensure" ||
    t === "state_license" ||
    t === "clinical_license" ||
    t === "clinician_license" ||
    t === "practitioner_license" ||
    t === "therapy_license" ||
    t === "pt_license" ||
    t === "pta_license" ||
    t === "ot_license" ||
    t === "ota_license" ||
    t === "rn_license" ||
    t === "lpn_license" ||
    t === "lvn_license" ||
    t === "np_license" ||
    t === "aprn_license" ||
    t === "slp_license" ||
    t === "speech_license" ||
    t === "msw_license"
  ) {
    return "professional_license";
  }
  if (t === "tb_test" || t === "tb" || t === "tb_documentation" || t === "tb_doc") {
    return "tb_test";
  }
  if (t === "background_check" || t === "background") {
    return "background_check";
  }
  if (t === "oig_check" || t === "oig" || t === "oig_proof" || t === "oig_exclusion") {
    return "oig_check";
  }

  return t;
}

export function buildPersonnelFileDocumentKeySet(sourceTypes: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const raw of sourceTypes) {
    const k = normalizePersonnelFileDocumentKey(raw);
    if (k) set.add(k);
  }
  return set;
}

type WithDocTypeAndCreated = {
  document_type?: string | null;
  created_at?: string | null;
};

/** Newest upload matching the canonical document key (after alias normalization). */
export function getLatestApplicantUploadByCanonicalType<T extends WithDocTypeAndCreated>(
  files: T[],
  canonicalKey: string
): T | null {
  const want = normalizePersonnelFileDocumentKey(canonicalKey);
  const matches = files.filter(
    (f) => normalizePersonnelFileDocumentKey(f.document_type) === want
  );
  if (matches.length === 0) return null;
  return matches
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )[0];
}

const EMPLOYEE_ONBOARDING = (applicantId: string, path: string) =>
  `${path}?applicant=${encodeURIComponent(applicantId)}`;

export type PersonnelFileAuditRow = {
  label: string;
  itemType: "document" | "form" | "summary";
  status: string;
  statusTone: "green" | "red" | "slate";
  /** Admin work area: `/admin/employees/{id}?tab=…` */
  openHref: string | null;
  /** Employee onboarding portal (same items as pipeline). */
  portalHref?: string | null;
  viewHref: string | null;
  downloadHref?: string | null;
  viewExternal?: boolean;
  /** When set, used as `documentType` for admin applicant uploads instead of the row label. */
  applicantUploadDocumentType?: string;
};

export type BuildPersonnelFileAuditArgs = {
  applicantId: string;
  isSalesAgent: boolean;
  isApplicationComplete: boolean;
  isDocumentsComplete: boolean;
  isContractsComplete: boolean;
  isTaxFormSigned: boolean;
  isTrainingComplete: boolean;
  isSkillsComplete: boolean;
  isPerformanceComplete: boolean;
  hasTbDocumentation: boolean;
  isOigComplete: boolean;
  /** True when an OIG proof file exists (`oig` / `oig_check`), independent of compliance event. */
  hasOigProofOnFile: boolean;
  hasBackgroundCheck: boolean;
  requiresCpr: boolean;
  hasCprCard: boolean;
  requiresDriversLicense: boolean;
  hasDriversLicense: boolean;
  hasResumeOnFile: boolean;
  hasSocialSecurityCard: boolean;
  hasEmployeeHandbookAck: boolean;
  hasJobAcceptanceStatement: boolean;
  hasI9Section1: boolean;
  hasConflictOfInterestForm: boolean;
  hasElectronicSignatureAgreement: boolean;
  hasHepatitisBDeclination: boolean;
  hasTbRiskAssessment: boolean;
  requiresFingerprintCard: boolean;
  hasFingerprintCard: boolean;
  requiresAutoInsurance: boolean;
  hasAutoInsurance: boolean;
  requiresIndependentContractorInsurance: boolean;
  hasIndependentContractorInsurance: boolean;
  applicationViewHref: string;
  trainingCertificateHref: string | null;
  contractPdfHref: string | null;
  taxFormPdfHref: string | null;
  handbookPdfHref: string | null;
  jobAcceptancePdfHref: string | null;
  i9PdfHref: string | null;
  conflictPdfHref: string | null;
  electronicAgreementPdfHref: string | null;
  hepatitisBPdfHref: string | null;
  tbRiskPdfHref: string | null;
  skillsPrintHref: string;
  skillsCanPrint: boolean;
  /** Direct admin link to the Skills Competency form (include `eventId` when an active event exists). */
  skillsCompetencyAdminHref: string;
  performancePrintHref: string;
  performanceCanPrint: boolean;
  /** Direct admin link to the Performance Evaluation form (include `eventId` when an active event exists). */
  performanceEvaluationAdminHref: string;
  latestResumeViewUrl: string | null;
  latestCprViewUrl: string | null;
  latestDriversLicenseViewUrl: string | null;
  latestSocialSecurityCardViewUrl: string | null;
  latestFingerprintViewUrl: string | null;
  latestAutoInsuranceViewUrl: string | null;
  latestIndependentContractorInsuranceViewUrl: string | null;
  latestTbViewUrl: string | null;
  latestOigViewUrl: string | null;
  latestBackgroundCheckViewUrl: string | null;
  getAdminWorkAreaUrl: (tab: EmployeeDetailWorkAreaTab) => string;
};

function auditStatus(required: boolean, satisfied: boolean): { status: string; tone: PersonnelFileAuditRow["statusTone"] } {
  if (!required) return { status: "Not required", tone: "slate" };
  if (satisfied) return { status: "Complete", tone: "green" };
  return { status: "Missing", tone: "red" };
}

/**
 * One table for the deferred “Personnel file audit” card — same booleans as hiring + compliance rows.
 */
export function buildPersonnelFileAuditRows(input: BuildPersonnelFileAuditArgs): PersonnelFileAuditRow[] {
  const {
    applicantId,
    isSalesAgent,
    isApplicationComplete,
    isDocumentsComplete,
    isContractsComplete,
    isTaxFormSigned,
    isTrainingComplete,
    isSkillsComplete,
    isPerformanceComplete,
    hasTbDocumentation,
    isOigComplete,
    hasOigProofOnFile,
    hasBackgroundCheck,
    requiresCpr,
    hasCprCard,
    requiresDriversLicense,
    hasDriversLicense,
    hasResumeOnFile,
    hasSocialSecurityCard,
    hasEmployeeHandbookAck,
    hasJobAcceptanceStatement,
    hasI9Section1,
    hasConflictOfInterestForm,
    hasElectronicSignatureAgreement,
    hasHepatitisBDeclination,
    hasTbRiskAssessment,
    requiresFingerprintCard,
    hasFingerprintCard,
    requiresAutoInsurance,
    hasAutoInsurance,
    requiresIndependentContractorInsurance,
    hasIndependentContractorInsurance,
    applicationViewHref,
    trainingCertificateHref,
    contractPdfHref,
    taxFormPdfHref,
    handbookPdfHref,
    jobAcceptancePdfHref,
    i9PdfHref,
    conflictPdfHref,
    electronicAgreementPdfHref,
    hepatitisBPdfHref,
    tbRiskPdfHref,
    skillsPrintHref,
    skillsCanPrint,
    skillsCompetencyAdminHref,
    performancePrintHref,
    performanceCanPrint,
    performanceEvaluationAdminHref,
    latestResumeViewUrl,
    latestCprViewUrl,
    latestDriversLicenseViewUrl,
    latestSocialSecurityCardViewUrl,
    latestFingerprintViewUrl,
    latestAutoInsuranceViewUrl,
    latestIndependentContractorInsuranceViewUrl,
    latestTbViewUrl,
    latestOigViewUrl,
    latestBackgroundCheckViewUrl,
    getAdminWorkAreaUrl,
  } = input;

  const appendInline = (href: string) =>
    href.includes("?") ? `${href}&inline=1` : `${href}?inline=1`;

  const rows: PersonnelFileAuditRow[] = [];

  const push = (r: PersonnelFileAuditRow) => rows.push(r);

  // --- Core (all bands)
  {
    const { status, tone } = auditStatus(true, isApplicationComplete);
    push({
      label: "Application",
      itemType: "summary",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("overview"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-application"),
      viewHref: isApplicationComplete ? appendInline(applicationViewHref) : null,
      downloadHref: isApplicationComplete ? applicationViewHref : null,
      viewExternal: false,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, isDocumentsComplete);
    push({
      label: "Documents",
      itemType: "summary",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref: null,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, hasResumeOnFile);
    push({
      label: "Resume",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref: hasResumeOnFile && latestResumeViewUrl ? latestResumeViewUrl : null,
      downloadHref: hasResumeOnFile && latestResumeViewUrl ? latestResumeViewUrl : null,
      viewExternal: true,
    });
  }

  {
    const { status, tone } = auditStatus(true, isContractsComplete);
    push({
      label: "Contracts",
      itemType: "summary",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("payroll"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-contracts"),
      viewHref:
        isContractsComplete && contractPdfHref ? appendInline(contractPdfHref) : null,
      downloadHref: isContractsComplete ? contractPdfHref : null,
      viewExternal: false,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, isTrainingComplete);
    push({
      label: "Training",
      itemType: "summary",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("training"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-training"),
      viewHref: trainingCertificateHref ? appendInline(trainingCertificateHref) : null,
      downloadHref: trainingCertificateHref,
      viewExternal: false,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, isSkillsComplete);
    push({
      label: "Skills Competency",
      itemType: "summary",
      status,
      statusTone: tone,
      openHref: skillsCompetencyAdminHref,
      viewHref:
        isSkillsComplete && skillsCanPrint ? skillsPrintHref : null,
      downloadHref: isSkillsComplete && skillsCanPrint ? skillsPrintHref : null,
      viewExternal: false,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, isPerformanceComplete);
    push({
      label: "Performance Evaluation",
      itemType: "summary",
      status,
      statusTone: tone,
      openHref: performanceEvaluationAdminHref,
      viewHref:
        isPerformanceComplete && performanceCanPrint ? performancePrintHref : null,
      downloadHref: isPerformanceComplete && performanceCanPrint ? performancePrintHref : null,
      viewExternal: false,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, hasTbDocumentation);
    push({
      label: "TB",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref: hasTbDocumentation && latestTbViewUrl ? latestTbViewUrl : null,
      downloadHref: hasTbDocumentation && latestTbViewUrl ? latestTbViewUrl : null,
      viewExternal: true,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, hasTbRiskAssessment);
    push({
      label: "TB Risk Assessment",
      itemType: "form",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref: hasTbRiskAssessment && tbRiskPdfHref ? appendInline(tbRiskPdfHref) : null,
      downloadHref: hasTbRiskAssessment ? tbRiskPdfHref : null,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, hasEmployeeHandbookAck);
    push({
      label: "Employee Handbook",
      itemType: "form",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref: hasEmployeeHandbookAck && handbookPdfHref ? appendInline(handbookPdfHref) : null,
      downloadHref: hasEmployeeHandbookAck ? handbookPdfHref : null,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, hasJobAcceptanceStatement);
    push({
      label: "Job Acceptance Statement",
      itemType: "form",
      status,
      statusTone: tone,
      openHref: `${EMPLOYEE_ONBOARDING(applicantId, "/onboarding-contracts")}#job-acceptance-section`,
      portalHref: `${EMPLOYEE_ONBOARDING(applicantId, "/onboarding-contracts")}#job-acceptance-section`,
      viewHref:
        hasJobAcceptanceStatement && jobAcceptancePdfHref
          ? appendInline(jobAcceptancePdfHref)
          : null,
      downloadHref: hasJobAcceptanceStatement ? jobAcceptancePdfHref : null,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, hasI9Section1);
    push({
      label: "I-9",
      itemType: "form",
      status,
      statusTone: tone,
      openHref: `${EMPLOYEE_ONBOARDING(applicantId, "/onboarding-contracts")}#i9-section`,
      portalHref: `${EMPLOYEE_ONBOARDING(applicantId, "/onboarding-contracts")}#i9-section`,
      viewHref: hasI9Section1 && i9PdfHref ? appendInline(i9PdfHref) : null,
      downloadHref: hasI9Section1 ? i9PdfHref : null,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, hasConflictOfInterestForm);
    push({
      label: "Conflict of Interest + Confidentiality",
      itemType: "form",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref:
        hasConflictOfInterestForm && conflictPdfHref ? appendInline(conflictPdfHref) : null,
      downloadHref: hasConflictOfInterestForm ? conflictPdfHref : null,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, hasElectronicSignatureAgreement);
    push({
      label: "Electronic Documentation Signature Agreement",
      itemType: "form",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref:
        hasElectronicSignatureAgreement && electronicAgreementPdfHref
          ? appendInline(electronicAgreementPdfHref)
          : null,
      downloadHref: hasElectronicSignatureAgreement ? electronicAgreementPdfHref : null,
    });
  }

  if (!isSalesAgent) {
    const { status, tone } = auditStatus(true, hasHepatitisBDeclination);
    push({
      label: "Hepatitis B Vaccine Declination",
      itemType: "form",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref:
        hasHepatitisBDeclination && hepatitisBPdfHref
          ? appendInline(hepatitisBPdfHref)
          : null,
      downloadHref: hasHepatitisBDeclination ? hepatitisBPdfHref : null,
    });
  }

  if (!isSalesAgent) {
    const oigAuditSatisfied = isOigComplete || hasOigProofOnFile;
    const { status, tone } = auditStatus(true, oigAuditSatisfied);
    push({
      label: "OIG",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("compliance"),
      viewHref: oigAuditSatisfied && latestOigViewUrl ? latestOigViewUrl : null,
      downloadHref: oigAuditSatisfied && latestOigViewUrl ? latestOigViewUrl : null,
      viewExternal: true,
      applicantUploadDocumentType: "oig",
    });
  }

  {
    const { status, tone } = auditStatus(true, hasBackgroundCheck);
    push({
      label: "Background Check",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref: hasBackgroundCheck && latestBackgroundCheckViewUrl ? latestBackgroundCheckViewUrl : null,
      downloadHref:
        hasBackgroundCheck && latestBackgroundCheckViewUrl ? latestBackgroundCheckViewUrl : null,
      viewExternal: true,
      applicantUploadDocumentType: "background_check",
    });
  }

  {
    const { status, tone } = auditStatus(true, isTaxFormSigned);
    push({
      label: "Tax Form",
      itemType: "form",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("payroll"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-contracts"),
      viewHref: isTaxFormSigned && taxFormPdfHref ? appendInline(taxFormPdfHref) : null,
      downloadHref: isTaxFormSigned ? taxFormPdfHref : null,
      viewExternal: false,
    });
  }

  {
    const { status, tone } = auditStatus(requiresCpr, !requiresCpr || hasCprCard);
    push({
      label: "CPR Card",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: requiresCpr ? getAdminWorkAreaUrl("credentials") : null,
      portalHref: requiresCpr ? EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents") : null,
      viewHref:
        requiresCpr && hasCprCard && latestCprViewUrl ? latestCprViewUrl : null,
      downloadHref:
        requiresCpr && hasCprCard && latestCprViewUrl ? latestCprViewUrl : null,
      viewExternal: true,
    });
  }

  {
    const { status, tone } = auditStatus(requiresDriversLicense, !requiresDriversLicense || hasDriversLicense);
    push({
      label: "Driver’s License",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: requiresDriversLicense ? getAdminWorkAreaUrl("credentials") : null,
      portalHref: requiresDriversLicense
        ? EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents")
        : null,
      viewHref:
        requiresDriversLicense && hasDriversLicense && latestDriversLicenseViewUrl
          ? latestDriversLicenseViewUrl
          : null,
      downloadHref:
        requiresDriversLicense && hasDriversLicense && latestDriversLicenseViewUrl
          ? latestDriversLicenseViewUrl
          : null,
      viewExternal: true,
    });
  }

  {
    const { status, tone } = auditStatus(true, hasSocialSecurityCard);
    push({
      label: "Social Security Card",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref: hasSocialSecurityCard && latestSocialSecurityCardViewUrl ? latestSocialSecurityCardViewUrl : null,
      downloadHref:
        hasSocialSecurityCard && latestSocialSecurityCardViewUrl
          ? latestSocialSecurityCardViewUrl
          : null,
      viewExternal: true,
    });
  }

  {
    const { status, tone } = auditStatus(
      requiresFingerprintCard,
      !requiresFingerprintCard || hasFingerprintCard
    );
    push({
      label: "AZ Fingerprint Clearance Card",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: requiresFingerprintCard ? getAdminWorkAreaUrl("credentials") : null,
      portalHref: requiresFingerprintCard
        ? EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents")
        : null,
      viewHref:
        requiresFingerprintCard && hasFingerprintCard && latestFingerprintViewUrl
          ? latestFingerprintViewUrl
          : null,
      downloadHref:
        requiresFingerprintCard && hasFingerprintCard && latestFingerprintViewUrl
          ? latestFingerprintViewUrl
          : null,
      viewExternal: true,
    });
  }

  if (requiresAutoInsurance) {
    const { status, tone } = auditStatus(true, hasAutoInsurance);
    push({
      label: "Auto Insurance",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("documents"),
      portalHref: EMPLOYEE_ONBOARDING(applicantId, "/onboarding-documents"),
      viewHref:
        hasAutoInsurance && latestAutoInsuranceViewUrl ? latestAutoInsuranceViewUrl : null,
      downloadHref:
        hasAutoInsurance && latestAutoInsuranceViewUrl ? latestAutoInsuranceViewUrl : null,
      viewExternal: true,
    });
  }

  if (requiresIndependentContractorInsurance) {
    const { status, tone } = auditStatus(true, hasIndependentContractorInsurance);
    push({
      label: "Independent Contractor Insurance",
      itemType: "document",
      status,
      statusTone: tone,
      openHref: getAdminWorkAreaUrl("credentials"),
      viewHref:
        hasIndependentContractorInsurance && latestIndependentContractorInsuranceViewUrl
          ? latestIndependentContractorInsuranceViewUrl
          : null,
      downloadHref:
        hasIndependentContractorInsurance && latestIndependentContractorInsuranceViewUrl
          ? latestIndependentContractorInsuranceViewUrl
          : null,
      viewExternal: true,
    });
  }

  return rows;
}
