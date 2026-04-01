export const STAFF_TEMP_PASSWORD_MIN = 6;
export const STAFF_TEMP_PASSWORD_MAX = 72;

export function normalizeStaffLookupEmail(raw: string | null | undefined): string {
  return (typeof raw === "string" ? raw : "").trim().toLowerCase();
}
