/**
 * SINGLE SOURCE OF TRUTH FOR EMPLOYEE REQUIREMENTS (role → credential matrix)
 *
 * Pipeline (server / RSC only for step 3):
 * 1. `buildApplicantRoleFieldsFromRecord(applicantRow)` — unions every role-ish DB column.
 * 2. `mergeApplicantRoleHints(fields)` — single lowercase string for matchers.
 * 3. `getRequiredCredentialTypesForApplicant(fields, employmentClassification, { contractRoleKey })`
 *    — `@/lib/admin/employee-directory-data` (augments merge with `employee_contracts.role_key`).
 *
 * DO NOT duplicate discipline / caregiver / sales matrices on the employee detail page.
 * Extend `isCaregiverFamilyRole`, `getRequiredCredentialTypesForApplicant`, or this pipeline only.
 */

export type { ApplicantRoleFields } from "@/lib/applicant-role-for-compliance";

export {
  buildApplicantRoleFieldsFromRecord,
  mergeApplicantRoleHints,
  isSalesAgentComplianceBand,
  isCaregiverFamilyRole,
} from "./personnel-file-requirements";
