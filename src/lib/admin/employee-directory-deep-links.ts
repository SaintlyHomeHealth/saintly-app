import {
  employeeDetailAdminTabUrl,
  type EmployeeDetailWorkAreaTab,
} from "@/lib/employee-requirements/employee-detail-work-areas";

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

function tab(employeeId: string, workArea: EmployeeDetailWorkAreaTab): string {
  return employeeDetailAdminTabUrl(`/admin/employees/${employeeId}`, workArea);
}

/**
 * Maps a directory compliance cell to the employee record `?tab=` work area (scroll targets on detail page).
 */
export function complianceDirectoryItemHref(
  employeeId: string,
  itemKey: EmployeeDirectoryItemKey,
  requiredCredentialTypes: readonly string[]
): string {
  switch (itemKey) {
    case "professional_license":
    case "cpr":
    case "tb_expiration":
    case "drivers_license":
      return tab(employeeId, "credentials");
    case "insurance": {
      if (requiredCredentialTypes.includes("independent_contractor_insurance")) {
        return tab(employeeId, "credentials");
      }
      if (requiredCredentialTypes.includes("auto_insurance")) {
        return tab(employeeId, "credentials");
      }
      return tab(employeeId, "credentials");
    }
    case "skills":
      return tab(employeeId, "skills");
    case "performance":
      return tab(employeeId, "performance");
    case "annual_tb_stmt":
    case "annual_train":
    case "annual_contract_rev":
      return tab(employeeId, "compliance");
    default:
      return `/admin/employees/${employeeId}`;
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
  const b = employeeId;
  if (r.commandComplianceStatus === "missing_expired") {
    const credIssue = r.flagMissingCredential || r.flagExpiredCredential;
    if (!credIssue && r.flagAnnualDue) {
      return tab(b, "compliance");
    }
    return tab(b, "credentials");
  }
  if (r.commandComplianceStatus === "due_soon") {
    if (r.flagActivationBlocked) return tab(b, "payroll");
    if (r.flagOnboardingIncomplete) return tab(b, "overview");
    if (r.flagAnnualDue) return tab(b, "compliance");
    return tab(b, "credentials");
  }
  return tab(b, "credentials");
}

export type EmployeeDirectoryFlagKind =
  | "miss_cred"
  | "due_30d"
  | "annual"
  | "onboard"
  | "blocked";

export function complianceFlagHref(employeeId: string, kind: EmployeeDirectoryFlagKind): string {
  const b = employeeId;
  switch (kind) {
    case "blocked":
      return tab(b, "payroll");
    case "miss_cred":
    case "due_30d":
      return tab(b, "credentials");
    case "annual":
      return tab(b, "compliance");
    case "onboard":
      return tab(b, "overview");
    default:
      return `/admin/employees/${b}`;
  }
}
