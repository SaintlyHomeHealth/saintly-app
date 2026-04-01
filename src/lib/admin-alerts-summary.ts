export type AdminAlertsSummary = {
  missingCredentials: number;
  expiredCredentials: number;
  dueSoonCredentials: number;
  overdueAnnualEvents: number;
  dueSoonAnnualEvents: number;
  readyToActivate: number;
};

export function buildAdminAlertsSummary(
  summary: AdminAlertsSummary
): AdminAlertsSummary {
  return summary;
}
