/** Private bucket for Medicare/insurance card photos submitted by sales agents. */
export const LEAD_DOCUMENTS_BUCKET = "lead-documents";

export const LEAD_DOCUMENT_TYPES = [
  "medicare_card_front",
  "medicare_card_back",
  "insurance_card_front",
  "insurance_card_back",
] as const;

export type LeadDocumentType = (typeof LEAD_DOCUMENT_TYPES)[number];

const DOC_TYPE_SET = new Set<string>(LEAD_DOCUMENT_TYPES);

export function isValidLeadDocumentType(v: string): v is LeadDocumentType {
  return DOC_TYPE_SET.has(v);
}

export const LEAD_DOCUMENT_TYPE_LABELS: Record<LeadDocumentType, string> = {
  medicare_card_front: "Medicare card (front)",
  medicare_card_back: "Medicare card (back)",
  insurance_card_front: "Insurance card (front)",
  insurance_card_back: "Insurance card (back)",
};

export const LEAD_DOCUMENTS_MAX_BYTES = 10 * 1024 * 1024;

export function isAllowedLeadDocumentMime(mime: string): boolean {
  const s = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  return (
    s === "image/jpeg" ||
    s === "image/png" ||
    s === "image/webp" ||
    s === "application/pdf"
  );
}

export function sanitizeLeadDocumentFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 200) || "file";
}

export function leadDocumentStoragePath(leadId: string, docId: string, fileName: string): string {
  return `${leadId}/${docId}-${sanitizeLeadDocumentFileName(fileName)}`;
}
