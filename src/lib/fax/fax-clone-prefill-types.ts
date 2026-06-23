/** Normalized compose prefill returned by getFaxClonePrefill for "Send another doc". */
export type FaxClonePrefill = {
  sourceFaxId: string;
  recipientName: string;
  recipientOrganization: string;
  recipientFax: string;
  recipientPhone: string;
  patientName: string;
  patientDob: string;
  patientMedicareNumber: string;
  patientId: string | null;
  recipientContactId: string | null;
  fromFaxNumber: string;
  /** Prior cover sheet template — not auto-selected; kept for reference only. */
  priorCoverSheetTemplateId: string | null;
  /** Prior document template — not auto-selected; kept for reference only. */
  priorDocumentTemplateId: string | null;
  templateType: string | null;
};
