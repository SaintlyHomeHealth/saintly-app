/** Matches payer_credentialing_documents.doc_type in DB (seed + trigger). */

export const PAYER_CREDENTIALING_DOC_TYPES = [
  "w9",
  "npi_letter",
  "liability_insurance",
  "accreditation",
  "eft_era",
  "portal_enrollment",
] as const;

export type PayerCredentialingDocType = (typeof PAYER_CREDENTIALING_DOC_TYPES)[number];

export const PAYER_CREDENTIALING_DOC_LABELS: Record<PayerCredentialingDocType, string> = {
  w9: "W-9",
  npi_letter: "NPI letter",
  liability_insurance: "Liability insurance",
  accreditation: "Accreditation documentation",
  eft_era: "EFT / ERA form",
  portal_enrollment: "Portal enrollment / application",
};

/** DB check: payer_credentialing_documents.status */
export const PAYER_CREDENTIALING_DOC_STATUS_VALUES = ["missing", "uploaded", "not_applicable"] as const;

export type PayerCredentialingDocStatus = (typeof PAYER_CREDENTIALING_DOC_STATUS_VALUES)[number];

export const PAYER_CREDENTIALING_DOC_STATUS_LABELS: Record<PayerCredentialingDocStatus, string> = {
  missing: "Missing",
  uploaded: "Uploaded",
  not_applicable: "N/A",
};

export function isPayerCredentialingDocStatus(v: string): v is PayerCredentialingDocStatus {
  return (PAYER_CREDENTIALING_DOC_STATUS_VALUES as readonly string[]).includes(v);
}

export function isPayerCredentialingDocType(v: string): v is PayerCredentialingDocType {
  return (PAYER_CREDENTIALING_DOC_TYPES as readonly string[]).includes(v);
}

export type PayerCredentialingDocRow = {
  id: string;
  doc_type: string;
  status: string;
  uploaded_at: string | null;
  notes: string | null;
};

export function summarizePayerDocuments(docs: { status: string }[]): {
  missing: number;
  uploaded: number;
  waived: number;
  total: number;
  hasMissing: boolean;
} {
  let missing = 0;
  let uploaded = 0;
  let waived = 0;
  for (const d of docs) {
    if (d.status === "missing") missing += 1;
    else if (d.status === "uploaded") uploaded += 1;
    else if (d.status === "not_applicable") waived += 1;
  }
  const total = docs.length;
  return { missing, uploaded, waived, total, hasMissing: missing > 0 };
}
