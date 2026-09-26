import type { LeadDocumentType } from "@/lib/crm/lead-documents-storage";

/** Card / ID photos on the sales-agent order form. Kept out of the create-lead request. */
export const SALES_AGENT_ORDER_PHOTO_FIELDS = [
  "medicare_card_front",
  "medicare_card_back",
  "insurance_card_front",
  "insurance_card_back",
  "drivers_license",
] as const satisfies readonly LeadDocumentType[];

export type SalesAgentOrderPhotoField = (typeof SALES_AGENT_ORDER_PHOTO_FIELDS)[number];

export const SALES_AGENT_ORDER_PHOTO_LABELS: Record<SalesAgentOrderPhotoField, string> = {
  medicare_card_front: "Medicare card (front)",
  medicare_card_back: "Medicare card (back)",
  insurance_card_front: "Insurance card (front)",
  insurance_card_back: "Insurance card (back)",
  drivers_license: "Driver's license",
};

/**
 * Copy text fields only. Phone-camera photos are uploaded after the lead exists
 * so the create request stays small enough to finish.
 */
export function formDataWithoutFiles(formData: FormData): FormData {
  const next = new FormData();
  for (const [key, value] of formData.entries()) {
    if (typeof File !== "undefined" && value instanceof File) continue;
    next.append(key, value);
  }
  return next;
}
