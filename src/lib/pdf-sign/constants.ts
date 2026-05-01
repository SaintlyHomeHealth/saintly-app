import "server-only";

export const PDF_SIGN_BUCKETS = {
  templates: "signature-templates",
  completed: "signature-completed",
  i9: "i9-documents",
} as const;

export type PdfSignDocumentType = "generic_contract" | "w9" | "i9";

export type PdfSignPacketStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "in_progress"
  | "signed"
  | "completed"
  | "expired"
  | "voided";

/** Standard W-9 field keys for templates (IRS Form W-9 data). */
export const W9_STANDARD_FIELD_KEYS = [
  "w9_name",
  "w9_business_name",
  "w9_federal_tax_classification",
  "w9_address",
  "w9_city_state_zip",
  "w9_tin",
  "w9_certification_ack",
  "w9_signature_name",
  "w9_signed_date",
] as const;

export const W9_PERJURY_CERTIFICATION_BLOCK = `Under penalties of perjury, I certify that:
1. The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and
2. I am not subject to backup withholding because: (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and
3. I am a U.S. citizen or other U.S. person; and
4. The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.

The Internal Revenue Service does not require your consent to any provisions of this document other than the certifications required to avoid backup withholding.`;
