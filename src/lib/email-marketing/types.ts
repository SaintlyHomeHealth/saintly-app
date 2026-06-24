export type EmailMarketingTemplateCategory =
  | "referral"
  | "doctor_office"
  | "primary_care"
  | "assisted_living"
  | "vendor_fair"
  | "follow_up"
  | "general";

export type EmailMarketingMessageStatus = "draft" | "queued" | "sending" | "sent" | "failed";

export type EmailMarketingTemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: EmailMarketingTemplateCategory;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailSenderProfileRow = {
  id: string;
  slug: string;
  display_name: string;
  title: string;
  phone: string;
  fax: string;
  email: string;
  signature: string;
  is_default: boolean;
  is_custom: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailMarketingFlyerRow = {
  id: string;
  file_name: string;
  file_url: string;
  storage_path: string;
  file_type: string;
  title: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailMarketingMessageRow = {
  id: string;
  sent_by_user_id: string | null;
  sender_profile_id: string | null;
  custom_sender_name: string | null;
  custom_sender_title: string | null;
  custom_sender_phone: string | null;
  custom_sender_email: string | null;
  from_email: string;
  reply_to_email: string;
  recipient_email: string;
  recipient_name: string | null;
  organization_name: string | null;
  subject: string;
  body: string;
  template_id: string | null;
  flyer_id: string | null;
  attach_flyer: boolean;
  status: EmailMarketingMessageStatus;
  provider: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export const EMAIL_MARKETING_CATEGORY_LABELS: Record<EmailMarketingTemplateCategory, string> = {
  referral: "Referral",
  doctor_office: "Doctor office",
  primary_care: "Primary care",
  assisted_living: "Assisted living",
  vendor_fair: "Vendor fair",
  follow_up: "Follow-up",
  general: "General",
};

export const EMAIL_MARKETING_FLYERS_BUCKET = "email-marketing-flyers";
export const EMAIL_INBOX_ATTACHMENTS_BUCKET = "email-inbox-attachments";

export type EmailMailboxRow = {
  id: string;
  provider: string;
  email_address: string;
  display_name: string | null;
  status: "pending" | "active" | "disconnected" | "error";
  oauth_refresh_token: string | null;
  last_sync_at: string | null;
  last_history_id: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailThreadRow = {
  id: string;
  mailbox_id: string;
  gmail_thread_id: string | null;
  subject: string;
  normalized_subject: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  participant_emails: string[];
  participant_names: string[];
  assigned_to: string | null;
  created_by: string | null;
  status: "open" | "archived" | "closed";
  category: string | null;
  linked_referral_source_id: string | null;
  linked_lead_id: string | null;
  linked_patient_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailMessageRow = {
  id: string;
  mailbox_id: string;
  thread_id: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  direction: "inbound" | "outbound";
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  subject: string;
  body_text: string;
  body_html: string | null;
  snippet: string | null;
  message_id_header: string | null;
  in_reply_to_header: string | null;
  references_header: string | null;
  gmail_internal_date: string | null;
  sent_by_user_id: string | null;
  sender_profile_id: string | null;
  custom_sender_name: string | null;
  custom_sender_title: string | null;
  custom_sender_phone: string | null;
  custom_sender_email: string | null;
  template_id: string | null;
  flyer_id: string | null;
  read_at: string | null;
  archived_at: string | null;
  has_attachments: boolean;
  raw_headers: Record<string, unknown>;
  status: string;
  provider: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailAttachmentRow = {
  id: string;
  message_id: string;
  gmail_attachment_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  storage_path: string | null;
  public_url: string | null;
  created_at: string;
};
