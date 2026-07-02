/**
 * Single source of truth for Employee Handbook Acknowledgement portal form keys and completion.
 */

export const EMPLOYEE_HANDBOOK_ACKNOWLEDGEMENT_KEY =
  "employee_handbook_acknowledgement" as const;

const HANDBOOK_KEY_ALIASES = new Set([
  "employee_handbook_acknowledgement",
  "employee_handbook_acknowledgment",
  "employee_handbook_ack",
  "employee_handbook",
  "handbook_acknowledgement",
  "handbook_acknowledgment",
  "handbook_ack",
  "handbook",
]);

export const EMPLOYEE_HANDBOOK_ACKNOWLEDGEMENT_LABEL = "Employee Handbook Acknowledgement";

export const EMPLOYEE_HANDBOOK_ACKNOWLEDGEMENT_AGREEMENT_TEXT = [
  "I acknowledge that I have reviewed or received access to the Saintly Home Health employee handbook and understand I am responsible for following agency standards, professionalism, and compliance expectations.",
];

export type EmployeeHandbookAcknowledgementRecord = {
  handbook_acknowledged?: boolean | null;
  handbook_full_name?: string | null;
  handbook_signed_at?: string | null;
};

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeEmployeeHandbookAcknowledgementKey(value: string): string {
  const normalized = value.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (HANDBOOK_KEY_ALIASES.has(normalized)) {
    return EMPLOYEE_HANDBOOK_ACKNOWLEDGEMENT_KEY;
  }
  return normalized;
}

export function isEmployeeHandbookAcknowledgementDocumentKey(value: string): boolean {
  return (
    normalizeEmployeeHandbookAcknowledgementKey(value) ===
    EMPLOYEE_HANDBOOK_ACKNOWLEDGEMENT_KEY
  );
}

/**
 * Portal Step 3 form is complete when acknowledged with name + date.
 * Legacy Step 4 contracts checkbox-only records (boolean without name/date) still count.
 */
export function isEmployeeHandbookAcknowledgementComplete(
  record: EmployeeHandbookAcknowledgementRecord | null | undefined
): boolean {
  if (record?.handbook_acknowledged !== true) return false;

  if (hasText(record.handbook_full_name) && hasText(record.handbook_signed_at)) {
    return true;
  }

  return true;
}

export function isEmployeeHandbookAcknowledgementPortalFormDraftComplete(
  record: EmployeeHandbookAcknowledgementRecord | null | undefined
): boolean {
  return (
    record?.handbook_acknowledged === true &&
    hasText(record.handbook_full_name) &&
    hasText(record.handbook_signed_at)
  );
}
