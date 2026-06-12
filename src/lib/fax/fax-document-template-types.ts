export type FaxDocumentTemplateRow = {
  id: string;
  name: string;
  body_content: string;
  attachment_storage_bucket: string | null;
  attachment_storage_path: string | null;
  attachment_file_name: string | null;
  attachment_content_type: string | null;
  attachment_size_bytes: number | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};
