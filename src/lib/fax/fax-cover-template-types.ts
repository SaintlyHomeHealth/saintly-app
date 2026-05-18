export type FaxCoverSheetTemplateRow = {
  id: string;
  name: string;
  slug: string;
  default_subject: string;
  default_message: string;
  is_default: boolean;
  is_system: boolean;
  sort_order: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FaxPacketMetadata = {
  recipient_organization?: string | null;
  recipient_phone?: string | null;
  recipient_fax?: string | null;
  patient_name?: string | null;
  patient_dob?: string | null;
  message?: string | null;
  cover_sheet_template_id?: string | null;
  cover_sheet_template_name?: string | null;
};

export type FaxCoverSheetFields = {
  recipientName: string;
  recipientOrganization: string;
  recipientPhone: string;
  recipientFax: string;
  patientName: string;
  patientDob: string;
  subject: string;
  message: string;
  date: string;
  totalPages: string;
};
