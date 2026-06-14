import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { ensureReferralChecklist } from "@/lib/crm/facility-referral-intake";
import {
  isAllowedLeadReferralDocumentContentType,
  isLeadReferralDocumentType,
  LEAD_REFERRAL_DOCUMENT_MAX_BYTES,
  LEAD_REFERRAL_DOCUMENT_MAX_FILES,
  LEAD_REFERRAL_DOCUMENT_TYPE_LABELS,
  LEAD_REFERRAL_DOCUMENTS_BUCKET,
  sanitizeReferralDocumentFileName,
  type LeadReferralDocumentType,
} from "@/lib/crm/lead-referral-documents-constants";
import type {
  LeadReferralDocumentRow,
  LeadReferralDocumentSummary,
  LeadReferralDocumentWorkspaceRow,
  ReferralDocumentUploadContext,
  ReferralDocumentUploadInput,
  ReferralDocumentUploadResult,
} from "@/lib/crm/lead-referral-documents-types";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapDocumentRow(raw: Record<string, unknown>): LeadReferralDocumentRow {
  const docType = typeof raw.document_type === "string" ? raw.document_type : null;
  return {
    id: String(raw.id),
    lead_id: String(raw.lead_id),
    facility_id: typeof raw.facility_id === "string" ? raw.facility_id : null,
    contact_id: typeof raw.contact_id === "string" ? raw.contact_id : null,
    source_link_id: typeof raw.source_link_id === "string" ? raw.source_link_id : null,
    uploaded_by_user_id: typeof raw.uploaded_by_user_id === "string" ? raw.uploaded_by_user_id : null,
    uploaded_by_public: Boolean(raw.uploaded_by_public),
    document_type: docType && isLeadReferralDocumentType(docType) ? docType : null,
    original_file_name: typeof raw.original_file_name === "string" ? raw.original_file_name : "file",
    mime_type: typeof raw.mime_type === "string" ? raw.mime_type : null,
    file_size_bytes:
      typeof raw.file_size_bytes === "number"
        ? raw.file_size_bytes
        : raw.file_size_bytes != null
          ? Number(raw.file_size_bytes)
          : null,
    status: typeof raw.status === "string" ? raw.status : "uploaded",
    review_status:
      raw.review_status === "reviewed" || raw.review_status === "rejected"
        ? raw.review_status
        : "needs_review",
    reviewed_by: typeof raw.reviewed_by === "string" ? raw.reviewed_by : null,
    reviewed_at: typeof raw.reviewed_at === "string" ? raw.reviewed_at : null,
    review_notes: typeof raw.review_notes === "string" ? raw.review_notes : null,
    extracted_summary: typeof raw.extracted_summary === "string" ? raw.extracted_summary : null,
    extracted_json:
      raw.extracted_json && typeof raw.extracted_json === "object" && !Array.isArray(raw.extracted_json)
        ? (raw.extracted_json as Record<string, unknown>)
        : null,
    ai_processed_at: typeof raw.ai_processed_at === "string" ? raw.ai_processed_at : null,
    ai_processing_error: typeof raw.ai_processing_error === "string" ? raw.ai_processing_error : null,
    ai_confidence:
      typeof raw.ai_confidence === "number"
        ? raw.ai_confidence
        : raw.ai_confidence != null
          ? Number(raw.ai_confidence)
          : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

type ChecklistSuggestion = {
  checklist_key: string;
  label: string;
  reason: string;
  document_id: string;
  document_type: LeadReferralDocumentType | null;
  created_at: string;
};

function checklistSuggestionForDocumentType(
  documentType: LeadReferralDocumentType | null,
  documentId: string
): ChecklistSuggestion | null {
  if (!documentType) return null;
  const now = new Date().toISOString();
  switch (documentType) {
    case "physician_order":
      return {
        checklist_key: "orders_received",
        label: "Physician order received",
        reason: "Suggested complete — physician order uploaded.",
        document_id: documentId,
        document_type: documentType,
        created_at: now,
      };
    case "insurance_card":
      return {
        checklist_key: "insurance_info_received",
        label: "Insurance info received",
        reason: "Suggested complete — insurance card uploaded.",
        document_id: documentId,
        document_type: documentType,
        created_at: now,
      };
    case "face_sheet":
    case "demographics":
      return {
        checklist_key: "demographics_received",
        label: "Demographics received",
        reason: `Suggested complete — ${LEAD_REFERRAL_DOCUMENT_TYPE_LABELS[documentType].toLowerCase()} uploaded.`,
        document_id: documentId,
        document_type: documentType,
        created_at: now,
      };
    case "referral_packet":
      return {
        checklist_key: "packet_received",
        label: "Referral packet received",
        reason: "Suggested complete — referral packet uploaded.",
        document_id: documentId,
        document_type: documentType,
        created_at: now,
      };
    default:
      return null;
  }
}

export async function applyDocumentChecklistSuggestions(
  leadId: string,
  uploadedDocuments: LeadReferralDocumentRow[]
): Promise<void> {
  if (uploadedDocuments.length === 0) return;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("referring_facility_id")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();

  const checklist = await ensureReferralChecklist(supabaseAdmin, {
    leadId,
    facilityId: typeof lead?.referring_facility_id === "string" ? lead.referring_facility_id : null,
  });
  if (!checklist) return;

  const existingJson = checklist.checklist_json ?? {};
  const prevSuggestions = Array.isArray(existingJson.document_upload_suggestions)
    ? (existingJson.document_upload_suggestions as ChecklistSuggestion[])
    : [];

  const newSuggestions: ChecklistSuggestion[] = [];
  for (const doc of uploadedDocuments) {
    const suggestion = checklistSuggestionForDocumentType(doc.document_type, doc.id);
    if (!suggestion) continue;
    const dup = prevSuggestions.some(
      (s) => s.document_id === suggestion.document_id || s.checklist_key === suggestion.checklist_key
    );
    const dupNew = newSuggestions.some((s) => s.checklist_key === suggestion.checklist_key);
    if (!dup && !dupNew) newSuggestions.push(suggestion);
  }

  if (newSuggestions.length === 0) return;

  const merged = [...prevSuggestions, ...newSuggestions];
  await supabaseAdmin
    .from("facility_referral_intake_checklists")
    .update({
      checklist_json: { ...existingJson, document_upload_suggestions: merged },
      updated_at: new Date().toISOString(),
    })
    .eq("lead_id", leadId);
}

async function fileToBuffer(file: File | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(file)) return file;
  return Buffer.from(await file.arrayBuffer());
}

export async function uploadLeadReferralDocuments(
  context: ReferralDocumentUploadContext,
  inputs: ReferralDocumentUploadInput[]
): Promise<ReferralDocumentUploadResult> {
  if (!UUID_RE.test(context.leadId)) return { ok: false, error: "invalid_lead_id" };

  const { data: leadRow } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("id", context.leadId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!leadRow?.id) return { ok: false, error: "lead_not_found" };

  if (inputs.length > LEAD_REFERRAL_DOCUMENT_MAX_FILES) {
    return { ok: false, error: "too_many_files" };
  }

  const uploaded: LeadReferralDocumentRow[] = [];
  const failed: Array<{ fileName: string; error: string }> = [];

  for (const input of inputs) {
    const fileName = input.fileName.trim() || "file";
    if (input.fileSize <= 0) {
      failed.push({ fileName, error: "empty_file" });
      continue;
    }
    if (input.fileSize > LEAD_REFERRAL_DOCUMENT_MAX_BYTES) {
      failed.push({ fileName, error: "file_too_large" });
      continue;
    }

    const mime = input.mimeType.trim() || "application/octet-stream";
    if (!isAllowedLeadReferralDocumentContentType(mime)) {
      failed.push({ fileName, error: "invalid_type" });
      continue;
    }

    const documentId = crypto.randomUUID();
    const safeName = sanitizeReferralDocumentFileName(fileName);
    const storagePath = `${context.leadId}/${documentId}-${safeName}`;

    let buffer: Buffer;
    try {
      buffer = await fileToBuffer(input.file);
    } catch {
      failed.push({ fileName, error: "read_failed" });
      continue;
    }

    if (buffer.length > LEAD_REFERRAL_DOCUMENT_MAX_BYTES) {
      failed.push({ fileName, error: "file_too_large" });
      continue;
    }

    const { error: upErr } = await supabaseAdmin.storage
      .from(LEAD_REFERRAL_DOCUMENTS_BUCKET)
      .upload(storagePath, buffer, { contentType: mime, upsert: false });

    if (upErr) {
      console.warn("[lead-referral-documents] storage upload:", upErr.message);
      failed.push({ fileName, error: "upload_failed" });
      continue;
    }

    const docType =
      input.documentType && isLeadReferralDocumentType(input.documentType) ? input.documentType : null;

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("lead_referral_documents")
      .insert({
        id: documentId,
        lead_id: context.leadId,
        facility_id: context.facilityId ?? null,
        contact_id: context.contactId ?? null,
        source_link_id: context.sourceLinkId ?? null,
        uploaded_by_user_id: context.uploadedByUserId ?? null,
        uploaded_by_public: Boolean(context.uploadedByPublic),
        document_type: docType,
        original_file_name: fileName.slice(0, 500),
        storage_path: storagePath,
        mime_type: mime,
        file_size_bytes: input.fileSize,
        review_notes: input.reviewNotes?.trim().slice(0, 4000) ?? null,
      })
      .select("*")
      .maybeSingle();

    if (insErr || !inserted) {
      await supabaseAdmin.storage.from(LEAD_REFERRAL_DOCUMENTS_BUCKET).remove([storagePath]).catch(() => {});
      failed.push({ fileName, error: "save_failed" });
      continue;
    }

    uploaded.push(mapDocumentRow(inserted as Record<string, unknown>));
  }

  if (uploaded.length > 0) {
    await applyDocumentChecklistSuggestions(context.leadId, uploaded).catch((e) =>
      console.warn("[lead-referral-documents] checklist suggestions:", e)
    );
  }

  return { ok: true, uploaded, failed };
}

export async function loadLeadReferralDocumentsForLead(leadId: string): Promise<LeadReferralDocumentWorkspaceRow[]> {
  if (!UUID_RE.test(leadId)) return [];

  const { data, error } = await supabaseAdmin
    .from("lead_referral_documents")
    .select("*")
    .eq("lead_id", leadId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[lead-referral-documents] load:", error.message);
    return [];
  }

  const uploaderIds = new Set<string>();
  const reviewerIds = new Set<string>();
  for (const row of data ?? []) {
    const r = row as { uploaded_by_user_id?: string; reviewed_by?: string };
    if (r.uploaded_by_user_id) uploaderIds.add(r.uploaded_by_user_id);
    if (r.reviewed_by) reviewerIds.add(r.reviewed_by);
  }

  const staffIds = [...new Set([...uploaderIds, ...reviewerIds])];
  const staffById = new Map<string, { full_name: string | null; email: string | null }>();
  if (staffIds.length > 0) {
    const { data: staffRows } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, full_name, email")
      .in("user_id", staffIds);
    for (const s of staffRows ?? []) {
      const row = s as { user_id: string; full_name: string | null; email: string | null };
      staffById.set(row.user_id, { full_name: row.full_name, email: row.email });
    }
  }

  return (data ?? []).map((raw) => {
    const row = mapDocumentRow(raw as Record<string, unknown>);
    return {
      ...row,
      uploaded_by_label: row.uploaded_by_public
        ? "Referral source (public)"
        : staffLabelFromLookup(row.uploaded_by_user_id, staffById),
      reviewed_by_label: staffLabelFromLookup(row.reviewed_by, staffById),
    };
  });
}

export async function getLeadReferralDocumentFilePath(
  leadId: string,
  documentId: string
): Promise<{ path: string; fileName: string; mimeType: string | null } | null> {
  if (!UUID_RE.test(leadId) || !UUID_RE.test(documentId)) return null;

  const { data } = await supabaseAdmin
    .from("lead_referral_documents")
    .select("storage_path, original_file_name, mime_type, status")
    .eq("id", documentId)
    .eq("lead_id", leadId)
    .neq("status", "deleted")
    .maybeSingle();

  if (!data || typeof data.storage_path !== "string" || !data.storage_path.trim()) return null;

  return {
    path: data.storage_path.trim(),
    fileName: typeof data.original_file_name === "string" ? data.original_file_name : "document",
    mimeType: typeof data.mime_type === "string" ? data.mime_type : null,
  };
}

export async function createLeadReferralDocumentSignedUrl(
  leadId: string,
  documentId: string,
  download?: boolean
): Promise<string | null> {
  const file = await getLeadReferralDocumentFilePath(leadId, documentId);
  if (!file) return null;

  const safeName = sanitizeReferralDocumentFileName(file.fileName);
  const { data, error } = await supabaseAdmin.storage
    .from(LEAD_REFERRAL_DOCUMENTS_BUCKET)
    .createSignedUrl(file.path, 60 * 60, download ? { download: safeName } : undefined);

  if (error || !data?.signedUrl) {
    console.warn("[lead-referral-documents] signed url:", error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function markLeadReferralDocumentReviewed(input: {
  leadId: string;
  documentId: string;
  reviewedBy: string;
  reviewNotes?: string | null;
}): Promise<{ ok: true; document: LeadReferralDocumentRow } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("lead_referral_documents")
    .update({
      review_status: "reviewed",
      reviewed_by: input.reviewedBy,
      reviewed_at: now,
      review_notes: input.reviewNotes?.trim().slice(0, 4000) ?? null,
      updated_at: now,
    })
    .eq("id", input.documentId)
    .eq("lead_id", input.leadId)
    .neq("status", "deleted")
    .select("*")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "update_failed" };
  return { ok: true, document: mapDocumentRow(data as Record<string, unknown>) };
}

export async function rejectLeadReferralDocument(input: {
  leadId: string;
  documentId: string;
  reviewedBy: string;
  reviewNotes?: string | null;
}): Promise<{ ok: true; document: LeadReferralDocumentRow } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("lead_referral_documents")
    .update({
      review_status: "rejected",
      reviewed_by: input.reviewedBy,
      reviewed_at: now,
      review_notes: input.reviewNotes?.trim().slice(0, 4000) ?? null,
      updated_at: now,
    })
    .eq("id", input.documentId)
    .eq("lead_id", input.leadId)
    .neq("status", "deleted")
    .select("*")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "update_failed" };
  return { ok: true, document: mapDocumentRow(data as Record<string, unknown>) };
}

function summarizeDocuments(
  rows: Array<{ document_type: string | null; review_status: string }>
): LeadReferralDocumentSummary {
  const types = rows
    .map((r) => r.document_type)
    .filter((t): t is LeadReferralDocumentType => typeof t === "string" && isLeadReferralDocumentType(t));
  const typeSet = new Set(types);

  return {
    document_count: rows.length,
    needs_review_count: rows.filter((r) => r.review_status === "needs_review").length,
    document_types: [...typeSet],
    has_physician_order: typeSet.has("physician_order"),
    has_face_sheet: typeSet.has("face_sheet"),
    has_demographics: typeSet.has("demographics"),
    has_insurance_card: typeSet.has("insurance_card"),
  };
}

export async function loadReferralDocumentSummariesByLeadIds(
  leadIds: string[]
): Promise<Map<string, LeadReferralDocumentSummary>> {
  const out = new Map<string, LeadReferralDocumentSummary>();
  const ids = leadIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return out;

  const { data, error } = await supabaseAdmin
    .from("lead_referral_documents")
    .select("lead_id, document_type, review_status")
    .in("lead_id", ids)
    .neq("status", "deleted");

  if (error) {
    console.warn("[lead-referral-documents] batch summary:", error.message);
    return out;
  }

  const byLead = new Map<string, Array<{ document_type: string | null; review_status: string }>>();
  for (const row of data ?? []) {
    const lid = String((row as { lead_id: string }).lead_id);
    const list = byLead.get(lid) ?? [];
    list.push({
      document_type: typeof (row as { document_type?: string }).document_type === "string"
        ? (row as { document_type: string }).document_type
        : null,
      review_status:
        typeof (row as { review_status?: string }).review_status === "string"
          ? (row as { review_status: string }).review_status
          : "needs_review",
    });
    byLead.set(lid, list);
  }

  for (const [leadId, rows] of byLead) {
    out.set(leadId, summarizeDocuments(rows));
  }
  return out;
}

export type ReferralDocumentAnalytics = {
  referralsWithDocuments: number;
  documentsNeedingReview: number;
  averageDocumentsPerReferral: number | null;
  referralsMissingDocuments: number;
  documentsByType: Record<string, number>;
};

export async function aggregateReferralDocumentAnalytics(leadIds: string[]): Promise<ReferralDocumentAnalytics> {
  const ids = leadIds.filter((id) => UUID_RE.test(id));
  const empty: ReferralDocumentAnalytics = {
    referralsWithDocuments: 0,
    documentsNeedingReview: 0,
    averageDocumentsPerReferral: null,
    referralsMissingDocuments: ids.length,
    documentsByType: {},
  };
  if (ids.length === 0) return empty;

  const { data, error } = await supabaseAdmin
    .from("lead_referral_documents")
    .select("lead_id, document_type, review_status")
    .in("lead_id", ids)
    .neq("status", "deleted");

  if (error) {
    console.warn("[lead-referral-documents] analytics:", error.message);
    return empty;
  }

  const leadsWithDocs = new Set<string>();
  let needsReview = 0;
  let totalDocs = 0;
  const byType: Record<string, number> = {};

  for (const row of data ?? []) {
    const lid = String((row as { lead_id: string }).lead_id);
    leadsWithDocs.add(lid);
    totalDocs++;
    if ((row as { review_status?: string }).review_status === "needs_review") needsReview++;

    const dt = (row as { document_type?: string }).document_type;
    if (typeof dt === "string" && dt) {
      byType[dt] = (byType[dt] ?? 0) + 1;
    }
  }

  return {
    referralsWithDocuments: leadsWithDocs.size,
    documentsNeedingReview: needsReview,
    averageDocumentsPerReferral: leadsWithDocs.size > 0 ? Math.round((totalDocs / leadsWithDocs.size) * 10) / 10 : null,
    referralsMissingDocuments: ids.length - leadsWithDocs.size,
    documentsByType: byType,
  };
}

export function publicReferralDocumentErrorMessage(code: string): string {
  switch (code) {
    case "too_many_files":
      return `You can upload up to ${LEAD_REFERRAL_DOCUMENT_MAX_FILES} files.`;
    case "file_too_large":
      return "Each file must be 10 MB or smaller.";
    case "invalid_type":
      return "Accepted file types: PDF, JPG, PNG, WEBP, or DOCX.";
    case "empty_file":
      return "One of the selected files is empty.";
    default:
      return "Could not upload one or more documents. Your referral was saved — you can call Saintly to send documents.";
  }
}
