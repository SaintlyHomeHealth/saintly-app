/** Private bucket; paths stored on `leads.primary_insurance_file_url` / `secondary_insurance_file_url`. */
export const LEAD_INSURANCE_BUCKET = "lead-insurance";

export const LEAD_INSURANCE_MAX_BYTES = 10 * 1024 * 1024;

export function isAllowedLeadInsuranceMime(mime: string): boolean {
  const s = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return (
    s === "image/jpeg" ||
    s === "image/png" ||
    s === "image/webp" ||
    s === "application/pdf"
  );
}

export function sanitizeLeadInsuranceFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 200) || "file";
}
