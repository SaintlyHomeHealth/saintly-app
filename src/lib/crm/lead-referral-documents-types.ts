import type {
  LeadReferralDocumentReviewStatus,
  LeadReferralDocumentType,
} from "@/lib/crm/lead-referral-documents-constants";

export type LeadReferralDocumentRow = {
  id: string;
  lead_id: string;
  facility_id: string | null;
  contact_id: string | null;
  source_link_id: string | null;
  uploaded_by_user_id: string | null;
  uploaded_by_public: boolean;
  document_type: LeadReferralDocumentType | null;
  original_file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  status: string;
  review_status: LeadReferralDocumentReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  extracted_summary: string | null;
  extracted_json: Record<string, unknown> | null;
  ai_processed_at: string | null;
  ai_processing_error: string | null;
  ai_confidence: number | null;
  created_at: string;
  updated_at: string;
};

export type LeadReferralDocumentWorkspaceRow = LeadReferralDocumentRow & {
  uploaded_by_label: string | null;
  reviewed_by_label: string | null;
};

export type LeadReferralDocumentSummary = {
  document_count: number;
  needs_review_count: number;
  document_types: LeadReferralDocumentType[];
  has_physician_order: boolean;
  has_face_sheet: boolean;
  has_demographics: boolean;
  has_insurance_card: boolean;
};

export type ReferralDocumentUploadInput = {
  file: File | Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentType?: LeadReferralDocumentType | null;
  reviewNotes?: string | null;
};

export type ReferralDocumentUploadContext = {
  leadId: string;
  facilityId?: string | null;
  contactId?: string | null;
  sourceLinkId?: string | null;
  uploadedByUserId?: string | null;
  uploadedByPublic?: boolean;
};

export type ReferralDocumentUploadResult =
  | { ok: true; uploaded: LeadReferralDocumentRow[]; failed: Array<{ fileName: string; error: string }> }
  | { ok: false; error: string };
