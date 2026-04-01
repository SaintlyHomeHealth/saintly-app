import { getCredentialAnchorId } from "@/lib/credential-anchors";

/** Mirrors `CommandComplianceStatus` in `employee-directory-data` (kept local to avoid circular imports). */
type ReadinessForHref = "clear" | "due_soon" | "missing_expired";

/** Item keys emitted by `loadEmployeeDirectoryRows` compliance columns. */
export type EmployeeDirectoryItemKey =
  | "professional_license"
  | "cpr"
  | "tb_expiration"
  | "drivers_license"
  | "insurance"
  | "skills"
  | "performance"
  | "annual_tb_stmt"
  | "annual_train"
  | "annual_contract_rev";

const DIRECTORY_ITEM_KEYS: readonly string[] = [
  "professional_license",
  "cpr",
  "tb_expiration",
  "drivers_license",
  "insurance",
  "skills",
  "performance",
  "annual_tb_stmt",
  "annual_train",
  "annual_contract_rev",
];

export function isEmployeeDirectoryItemKey(k: string): k is EmployeeDirectoryItemKey {
  return DIRECTORY_ITEM_KEYS.includes(k);
}

function base(employeeId: string): string {
  return `/admin/employees/${employeeId}`;
}

/**
 * Maps a directory compliance cell to the closest existing section on the employee record.
 * Anchors align with `[employeeId]/page.tsx`, `CredentialManager`, and `getCredentialAnchorId`.
 */
export function complianceDirectoryItemHref(
  employeeId: string,
  itemKey: EmployeeDirectoryItemKey,
  requiredCredentialTypes: readonly string[]
): string {
  const b = base(employeeId);
  switch (itemKey) {
    case "professional_license":
      return `${b}#${getCredentialAnchorId("professional_license")}`;
    case "cpr":
      return `${b}#${getCredentialAnchorId("cpr")}`;
    case "tb_expiration":
      return `${b}#tb-section`;
    case "drivers_license":
      return `${b}#${getCredentialAnchorId("drivers_license")}`;
    case "insurance": {
      if (requiredCredentialTypes.includes("independent_contractor_insurance")) {
        return `${b}#${getCredentialAnchorId("independent_contractor_insurance")}`;
      }
      if (requiredCredentialTypes.includes("auto_insurance")) {
        return `${b}#${getCredentialAnchorId("auto_insurance")}`;
      }
      return `${b}#expiring-credentials-section`;
    }
    case "skills":
      return `${b}#skills-section`;
    case "performance":
      return `${b}#performance-section`;
    case "annual_tb_stmt":
      return `${b}#tb-statement-section`;
    case "annual_train":
      return `${b}#training-checklist-section`;
    case "annual_contract_rev":
      return `${b}#contract-review-section`;
    default:
      return b;
  }
}

/** Rolled-up readiness pill → first place an admin should look. */
export function readinessSummaryHref(
  employeeId: string,
  r: {
    commandComplianceStatus: ReadinessForHref;
    flagMissingCredential: boolean;
    flagExpiredCredential: boolean;
    flagAnnualDue: boolean;
    flagActivationBlocked: boolean;
    flagOnboardingIncomplete: boolean;
  }
): string {
  const b = base(employeeId);
  if (r.commandComplianceStatus === "missing_expired") {
    const credIssue = r.flagMissingCredential || r.flagExpiredCredential;
    if (!credIssue && r.flagAnnualDue) {
      return `${b}#event-management`;
    }
    return `${b}#expiring-credentials-section`;
  }
  if (r.commandComplianceStatus === "due_soon") {
    if (r.flagActivationBlocked) return `${b}#hire-setup-section`;
    if (r.flagOnboardingIncomplete) return `${b}#onboarding-section`;
    if (r.flagAnnualDue) return `${b}#event-management`;
    return `${b}#expiring-credentials-section`;
  }
  return `${b}#credentials-section`;
}

export type EmployeeDirectoryFlagKind =
  | "miss_cred"
  | "due_30d"
  | "annual"
  | "onboard"
  | "blocked";

export function complianceFlagHref(employeeId: string, kind: EmployeeDirectoryFlagKind): string {
  const b = base(employeeId);
  switch (kind) {
    case "blocked":
      return `${b}#hire-setup-section`;
    case "miss_cred":
      return `${b}#expiring-credentials-section`;
    case "due_30d":
      return `${b}#expiring-credentials-section`;
    case "annual":
      return `${b}#event-management`;
    case "onboard":
      return `${b}#onboarding-section`;
    default:
      return b;
  }
}
