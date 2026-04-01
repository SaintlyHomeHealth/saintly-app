/** Human-readable labels for credential reminder UI (sync with SMS copy). */

export type CredentialReminderStageKey =
  | "due_soon_30"
  | "due_soon_7"
  | "due_soon"
  | "expired"
  | "missing";

export function formatCredentialReminderStage(stage: string): string {
  switch (stage) {
    case "due_soon_30":
      return "Due within 30 days (30-day reminder)";
    case "due_soon_7":
      return "Due within 7 days (7-day reminder)";
    case "due_soon":
      return "Due soon (legacy)";
    case "expired":
      return "Expired";
    case "missing":
      return "Missing on file";
    default:
      return stage.replace(/_/g, " ");
  }
}

export function formatCredentialReminderCredentialType(type: string): string {
  const labels: Record<string, string> = {
    professional_license: "Professional license",
    cpr: "CPR/BLS",
    tb_expiration: "TB (PPD/test)",
    drivers_license: "Driver license",
    auto_insurance: "Auto insurance",
    independent_contractor_insurance: "Contractor liability insurance",
  };
  return labels[type] || type.replace(/_/g, " ");
}
