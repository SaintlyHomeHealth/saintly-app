/**
 * Admin employee detail deep links use `?tab=` (not fragile hash-only jumps).
 * Scroll targets must match real element `id`s on `/admin/employees/[id]`.
 */

export type EmployeeDetailWorkAreaTab =
  | "overview"
  | "documents"
  | "training"
  | "skills"
  | "performance"
  | "compliance"
  | "credentials"
  | "payroll";

/** DOM id to scroll into view for each tab (see employee detail page). */
export const EMPLOYEE_DETAIL_TAB_SCROLL_ID: Record<EmployeeDetailWorkAreaTab, string> = {
  overview: "onboarding-admin-summary",
  documents: "documents-compliance-dashboard",
  training: "onboarding-portal-section",
  skills: "skills-section",
  performance: "performance-section",
  compliance: "compliance-program-status",
  credentials: "credentials-section",
  payroll: "hire-setup-section",
};

export function employeeDetailAdminTabUrl(
  employeePageBase: string,
  tab: EmployeeDetailWorkAreaTab
): string {
  return `${employeePageBase}?tab=${tab}`;
}
