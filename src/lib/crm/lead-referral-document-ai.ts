import "server-only";

import { PDFParse } from "pdf-parse";

import { supabaseAdmin } from "@/lib/admin";
import { appendLeadActivityRow } from "@/lib/crm/append-lead-activity";
import {
  updateReferralChecklist,
  type UpdateReferralChecklistInput,
} from "@/lib/crm/facility-referral-intake";
import {
  isLeadReferralDocumentType,
  LEAD_REFERRAL_DOCUMENT_TYPES,
  LEAD_REFERRAL_DOCUMENTS_BUCKET,
  type LeadReferralDocumentType,
} from "@/lib/crm/lead-referral-documents-constants";
import type {
  ApplyLeadDocumentSuggestionsInput,
  AnalyzeDocumentResult,
  LeadDocumentIntakeSummary,
  LeadReferralDocumentAiChecklistSuggestion,
  LeadReferralDocumentExtraction,
} from "@/lib/crm/lead-referral-document-ai-types";
import { createLeadReferralDocumentSignedUrl } from "@/lib/crm/lead-referral-documents";
import {
  notifyLeadDocumentAiReviewFailed,
  notifyLeadDocumentAiReviewReady,
  notifyLeadIntakeMissingRequiredDocuments,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import { fetchCrmOpenAiJsonObject } from "@/lib/crm/openai-crm-task-json";
import { saintlyCrmTaskExtractionModel } from "@/lib/crm/saintly-ai-voice-config";
import { parseOpenAiJsonContent } from "@/lib/phone/phone-call-ai-context";
import type { StaffProfile } from "@/lib/staff-profile";
import { isManagerOrHigher } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXT_CHARS = 80_000;

export function isLeadReferralDocumentAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function leadReferralDocumentAiErrorMessage(code: string): string {
  switch (code) {
    case "not_configured":
      return "AI document review is not configured.";
    case "unsupported_type":
      return "This file type is not supported for AI review.";
    case "empty_document":
      return "Could not read content from this document.";
    case "download_failed":
      return "Could not load the document for AI review.";
    case "ai_failed":
      return "AI review failed. Try again or review manually.";
    case "invalid_ai_response":
      return "AI returned an invalid response. Try re-analyzing.";
    case "document_not_found":
      return "Document not found.";
    case "lead_not_found":
      return "Lead not found.";
    case "forbidden":
      return "You do not have permission to perform this action.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function str(v: unknown, max = 500): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function numConfidence(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, v));
}

function buildExtractionSystemPrompt(): string {
  return `You are a home health intake assistant for Saintly Home Health. Analyze referral documents and return ONLY valid JSON with this shape:
{
  "document_type": one of ${LEAD_REFERRAL_DOCUMENT_TYPES.join(", ")}, or "other",
  "confidence": number 0-1,
  "summary": "1-2 sentence non-PHI summary for staff (may include patient name as found in document)",
  "patient": { "first_name": "", "last_name": "", "dob": "YYYY-MM-DD or empty", "phone": "", "address": "" },
  "payer": { "name": "", "member_id": "", "plan_type": "" },
  "provider": { "ordering_provider_name": "", "practice_name": "", "phone": "", "fax": "" },
  "services_requested": ["SN","PT","Wound care", etc],
  "diagnoses_or_clinical_notes": "",
  "order_detected": boolean,
  "face_sheet_detected": boolean,
  "insurance_detected": boolean,
  "missing_items": ["signed order", etc],
  "suggested_checklist_updates": [
    { "key": "physician_order_received", "label": "Physician order received", "suggested_status": "complete", "reason": "..." }
  ],
  "warnings": ["AI may be wrong. Verify before updating lead."]
}
Be conservative. Include warnings when uncertain. Always include "AI may be wrong. Verify before updating lead." in warnings.`;
}

function parseChecklistSuggestions(raw: unknown): LeadReferralDocumentAiChecklistSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: LeadReferralDocumentAiChecklistSuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = str(o.key, 80);
    const label = str(o.label, 120);
    if (!key || !label) continue;
    out.push({
      key,
      label,
      suggested_status: o.suggested_status === "needs_review" ? "needs_review" : "complete",
      reason: str(o.reason, 400) || "Document uploaded.",
    });
  }
  return out;
}

export function parseLeadReferralDocumentExtraction(raw: unknown): LeadReferralDocumentExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const patientRaw = (o.patient && typeof o.patient === "object" ? o.patient : {}) as Record<string, unknown>;
  const payerRaw = (o.payer && typeof o.payer === "object" ? o.payer : {}) as Record<string, unknown>;
  const providerRaw = (o.provider && typeof o.provider === "object" ? o.provider : {}) as Record<string, unknown>;

  const docTypeRaw = str(o.document_type, 40).toLowerCase();
  const document_type =
    docTypeRaw && isLeadReferralDocumentType(docTypeRaw)
      ? docTypeRaw
      : docTypeRaw === "other"
        ? "other"
        : null;

  const warnings = Array.isArray(o.warnings)
    ? o.warnings.filter((w): w is string => typeof w === "string").slice(0, 10)
    : [];
  if (!warnings.some((w) => w.toLowerCase().includes("verify"))) {
    warnings.push("AI may be wrong. Verify before updating lead.");
  }

  return {
    document_type,
    confidence: numConfidence(o.confidence),
    summary: str(o.summary, 2000) || "Document analyzed.",
    patient: {
      first_name: str(patientRaw.first_name, 80),
      last_name: str(patientRaw.last_name, 80),
      dob: str(patientRaw.dob, 10),
      phone: str(patientRaw.phone, 40),
      address: str(patientRaw.address, 300),
    },
    payer: {
      name: str(payerRaw.name, 120),
      member_id: str(payerRaw.member_id, 80),
      plan_type: str(payerRaw.plan_type, 80),
    },
    provider: {
      ordering_provider_name: str(providerRaw.ordering_provider_name, 120),
      practice_name: str(providerRaw.practice_name, 200),
      phone: str(providerRaw.phone, 40),
      fax: str(providerRaw.fax, 40),
    },
    services_requested: Array.isArray(o.services_requested)
      ? o.services_requested.filter((s): s is string => typeof s === "string").slice(0, 12)
      : [],
    diagnoses_or_clinical_notes: str(o.diagnoses_or_clinical_notes, 4000),
    order_detected: Boolean(o.order_detected),
    face_sheet_detected: Boolean(o.face_sheet_detected),
    insurance_detected: Boolean(o.insurance_detected),
    missing_items: Array.isArray(o.missing_items)
      ? o.missing_items.filter((m): m is string => typeof m === "string").slice(0, 12)
      : [],
    suggested_checklist_updates: parseChecklistSuggestions(o.suggested_checklist_updates),
    warnings,
  };
}

async function downloadDocumentBuffer(storagePath: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage.from(LEAD_REFERRAL_DOCUMENTS_BUCKET).download(storagePath);
  if (error || !data) {
    console.warn("[lead-referral-document-ai] download:", error?.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

async function extractTextFromBuffer(buffer: Buffer, mime: string, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  const mimeLower = mime.toLowerCase();

  if (mimeLower === "application/pdf" || lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return (result.text ?? "").trim().slice(0, MAX_TEXT_CHARS);
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeLower === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? "").trim().slice(0, MAX_TEXT_CHARS);
  }

  return "";
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

async function analyzeWithVision(signedUrl: string, fileName: string): Promise<unknown | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const model =
    process.env.SAINTLY_REFERRAL_DOCUMENT_AI_MODEL?.trim() ||
    process.env.SAINTLY_FACILITY_PHOTO_AI_MODEL?.trim() ||
    saintlyCrmTaskExtractionModel();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildExtractionSystemPrompt() },
        {
          role: "user",
          content: [
            { type: "text", text: `Analyze this referral document image: ${fileName}` },
            { type: "image_url", image_url: { url: signedUrl, detail: "high" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[lead-referral-document-ai] vision HTTP:", res.status, t.slice(0, 200));
    return null;
  }

  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  return content ? parseOpenAiJsonContent(content) : null;
}

async function analyzeWithText(text: string, fileName: string): Promise<unknown | null> {
  const userContent = `Document file name: ${fileName}\n\nExtracted text:\n${text.slice(0, MAX_TEXT_CHARS)}`;
  return fetchCrmOpenAiJsonObject(
    process.env.SAINTLY_REFERRAL_DOCUMENT_AI_MODEL?.trim() || saintlyCrmTaskExtractionModel(),
    buildExtractionSystemPrompt(),
    userContent
  );
}

async function markDocumentProcessing(documentId: string, leadId: string): Promise<void> {
  await supabaseAdmin
    .from("lead_referral_documents")
    .update({ status: "processing", ai_processing_error: null, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("lead_id", leadId)
    .neq("status", "deleted");
}

async function markDocumentFailed(documentId: string, leadId: string, error: string): Promise<void> {
  await supabaseAdmin
    .from("lead_referral_documents")
    .update({
      status: "failed",
      ai_processing_error: error.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("lead_id", leadId);
}

async function saveDocumentExtraction(
  documentId: string,
  leadId: string,
  extraction: LeadReferralDocumentExtraction,
  existingDocType: LeadReferralDocumentType | null
): Promise<void> {
  const patch: Record<string, unknown> = {
    extracted_summary: extraction.summary,
    extracted_json: extraction,
    ai_processed_at: new Date().toISOString(),
    ai_confidence: extraction.confidence,
    ai_processing_error: null,
    status: "ready",
    updated_at: new Date().toISOString(),
  };

  if (
    (!existingDocType || existingDocType === "other") &&
    extraction.document_type &&
    extraction.document_type !== "other" &&
    isLeadReferralDocumentType(extraction.document_type)
  ) {
    patch.document_type = extraction.document_type;
  }

  await supabaseAdmin.from("lead_referral_documents").update(patch).eq("id", documentId).eq("lead_id", leadId);
}

export async function analyzeLeadReferralDocument(documentId: string): Promise<AnalyzeDocumentResult> {
  if (!UUID_RE.test(documentId)) {
    return { ok: false, error: "invalid_id", message: leadReferralDocumentAiErrorMessage("invalid_id") };
  }
  if (!isLeadReferralDocumentAiConfigured()) {
    return { ok: false, error: "not_configured", message: leadReferralDocumentAiErrorMessage("not_configured") };
  }

  const { data: row } = await supabaseAdmin
    .from("lead_referral_documents")
    .select("id, lead_id, storage_path, mime_type, original_file_name, document_type, status")
    .eq("id", documentId)
    .neq("status", "deleted")
    .maybeSingle();

  if (!row?.id || typeof row.storage_path !== "string") {
    return { ok: false, error: "document_not_found", message: leadReferralDocumentAiErrorMessage("document_not_found") };
  }

  const leadId = String(row.lead_id);
  const mime = typeof row.mime_type === "string" ? row.mime_type : "application/octet-stream";
  const fileName = typeof row.original_file_name === "string" ? row.original_file_name : "document";
  const existingDocType =
    typeof row.document_type === "string" && isLeadReferralDocumentType(row.document_type)
      ? row.document_type
      : null;

  await markDocumentProcessing(documentId, leadId);

  const buffer = await downloadDocumentBuffer(row.storage_path.trim());
  if (!buffer || buffer.length === 0) {
    await markDocumentFailed(documentId, leadId, "download_failed");
    return { ok: false, error: "download_failed", message: leadReferralDocumentAiErrorMessage("download_failed") };
  }

  let aiRaw: unknown | null = null;

  if (isImageMime(mime)) {
    const signedUrl = await createLeadReferralDocumentSignedUrl(leadId, documentId, false);
    if (!signedUrl) {
      await markDocumentFailed(documentId, leadId, "signed_url_failed");
      return { ok: false, error: "download_failed", message: leadReferralDocumentAiErrorMessage("download_failed") };
    }
    aiRaw = await analyzeWithVision(signedUrl, fileName);
  } else if (
    mime === "application/pdf" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const text = await extractTextFromBuffer(buffer, mime, fileName);
    if (text.length >= 40) {
      aiRaw = await analyzeWithText(text, fileName);
    } else if (mime === "application/pdf") {
      await markDocumentFailed(documentId, leadId, "empty_document");
      return { ok: false, error: "empty_document", message: leadReferralDocumentAiErrorMessage("empty_document") };
    } else {
      await markDocumentFailed(documentId, leadId, "empty_document");
      return { ok: false, error: "empty_document", message: leadReferralDocumentAiErrorMessage("empty_document") };
    }
  } else {
    await markDocumentFailed(documentId, leadId, "unsupported_type");
    return { ok: false, error: "unsupported_type", message: leadReferralDocumentAiErrorMessage("unsupported_type") };
  }

  const extraction = parseLeadReferralDocumentExtraction(aiRaw);
  if (!extraction) {
    await markDocumentFailed(documentId, leadId, "invalid_ai_response");
    return { ok: false, error: "invalid_ai_response", message: leadReferralDocumentAiErrorMessage("invalid_ai_response") };
  }

  await saveDocumentExtraction(documentId, leadId, extraction, existingDocType);

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("referring_facility_id, assigned_to_staff_id")
    .eq("id", leadId)
    .maybeSingle();

  queueFacilityNotification(() =>
    notifyLeadDocumentAiReviewReady({
      leadId,
      facilityId: typeof lead?.referring_facility_id === "string" ? lead.referring_facility_id : null,
      documentCount: 1,
      intakeOwnerUserId:
        typeof lead?.assigned_to_staff_id === "string" ? lead.assigned_to_staff_id : null,
    })
  );

  return { ok: true, document_id: documentId, extraction };
}

export async function analyzeLeadReferralDocumentsForLead(leadId: string): Promise<{
  ok: boolean;
  analyzed: number;
  failed: number;
  summary: LeadDocumentIntakeSummary;
  errors: string[];
}> {
  if (!UUID_RE.test(leadId)) {
    return {
      ok: false,
      analyzed: 0,
      failed: 0,
      summary: emptyLeadDocumentIntakeSummary(),
      errors: ["invalid_lead_id"],
    };
  }

  const { data: docs } = await supabaseAdmin
    .from("lead_referral_documents")
    .select("id, status, ai_processed_at")
    .eq("lead_id", leadId)
    .neq("status", "deleted");

  const pending = (docs ?? []).filter(
    (d) => d.status !== "ready" || !d.ai_processed_at
  );

  let analyzed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const doc of pending) {
    const result = await analyzeLeadReferralDocument(String(doc.id));
    if (result.ok) analyzed++;
    else {
      failed++;
      errors.push(result.error);
      queueFacilityNotification(() =>
        notifyLeadDocumentAiReviewFailed({
          leadId,
          facilityId: null,
          intakeOwnerUserId: null,
        })
      );
    }
  }

  const summary = await buildLeadDocumentIntakeSummary(leadId);

  if (summary.missing_items.length > 0) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("referring_facility_id, assigned_to_staff_id")
      .eq("id", leadId)
      .maybeSingle();
    queueFacilityNotification(() =>
      notifyLeadIntakeMissingRequiredDocuments({
        leadId,
        facilityId: typeof lead?.referring_facility_id === "string" ? lead.referring_facility_id : null,
        missingCount: summary.missing_items.length,
        intakeOwnerUserId:
          typeof lead?.assigned_to_staff_id === "string" ? lead.assigned_to_staff_id : null,
      })
    );
  }

  return { ok: analyzed > 0 || failed === 0, analyzed, failed, summary, errors };
}

function emptyLeadDocumentIntakeSummary(): LeadDocumentIntakeSummary {
  return {
    configured: isLeadReferralDocumentAiConfigured(),
    document_count: 0,
    ai_ready_count: 0,
    ai_pending_count: 0,
    ai_failed_count: 0,
    average_confidence: null,
    combined_summary: null,
    patient: { first_name: "", last_name: "", dob: "", phone: "", address: "" },
    payer: { name: "", member_id: "", plan_type: "" },
    provider: { ordering_provider_name: "", practice_name: "", phone: "", fax: "" },
    services_requested: [],
    diagnoses_or_clinical_notes: null,
    missing_items: [],
    suggested_checklist_updates: [],
    warnings: [],
    order_detected: false,
    face_sheet_detected: false,
    insurance_detected: false,
    documents: [],
  };
}

function mergePatient(
  base: LeadReferralDocumentExtraction["patient"],
  next: LeadReferralDocumentExtraction["patient"]
): LeadReferralDocumentExtraction["patient"] {
  return {
    first_name: base.first_name || next.first_name,
    last_name: base.last_name || next.last_name,
    dob: base.dob || next.dob,
    phone: base.phone || next.phone,
    address: base.address || next.address,
  };
}

function mergePayer(
  base: LeadReferralDocumentExtraction["payer"],
  next: LeadReferralDocumentExtraction["payer"]
): LeadReferralDocumentExtraction["payer"] {
  return {
    name: base.name || next.name,
    member_id: base.member_id || next.member_id,
    plan_type: base.plan_type || next.plan_type,
  };
}

function mergeProvider(
  base: LeadReferralDocumentExtraction["provider"],
  next: LeadReferralDocumentExtraction["provider"]
): LeadReferralDocumentExtraction["provider"] {
  return {
    ordering_provider_name: base.ordering_provider_name || next.ordering_provider_name,
    practice_name: base.practice_name || next.practice_name,
    phone: base.phone || next.phone,
    fax: base.fax || next.fax,
  };
}

function dedupeChecklistSuggestions(
  items: LeadReferralDocumentAiChecklistSuggestion[]
): LeadReferralDocumentAiChecklistSuggestion[] {
  const seen = new Set<string>();
  const out: LeadReferralDocumentAiChecklistSuggestion[] = [];
  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item);
  }
  return out;
}

export async function buildLeadDocumentIntakeSummary(leadId: string): Promise<LeadDocumentIntakeSummary> {
  if (!UUID_RE.test(leadId)) return emptyLeadDocumentIntakeSummary();

  const { data: rows } = await supabaseAdmin
    .from("lead_referral_documents")
    .select(
      "id, original_file_name, document_type, status, ai_processed_at, ai_confidence, ai_processing_error, extracted_summary, extracted_json"
    )
    .eq("lead_id", leadId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (!rows?.length) return emptyLeadDocumentIntakeSummary();

  let patient = { first_name: "", last_name: "", dob: "", phone: "", address: "" };
  let payer = { name: "", member_id: "", plan_type: "" };
  let provider = { ordering_provider_name: "", practice_name: "", phone: "", fax: "" };
  const services = new Set<string>();
  const missingItems = new Set<string>();
  const warnings = new Set<string>();
  const checklistSuggestions: LeadReferralDocumentAiChecklistSuggestion[] = [];
  const summaries: string[] = [];
  let orderDetected = false;
  let faceSheetDetected = false;
  let insuranceDetected = false;
  let aiReady = 0;
  let aiPending = 0;
  let aiFailed = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let clinicalNotes = "";

  const documents: LeadDocumentIntakeSummary["documents"] = [];

  for (const raw of rows) {
    const status = typeof raw.status === "string" ? raw.status : "uploaded";
    const aiProcessedAt = typeof raw.ai_processed_at === "string" ? raw.ai_processed_at : null;
    const aiError = typeof raw.ai_processing_error === "string" ? raw.ai_processing_error : null;
    const docType =
      typeof raw.document_type === "string" && isLeadReferralDocumentType(raw.document_type)
        ? raw.document_type
        : null;

    if (status === "ready" && aiProcessedAt) aiReady++;
    else if (status === "failed" || aiError) aiFailed++;
    else aiPending++;

    const conf =
      typeof raw.ai_confidence === "number"
        ? raw.ai_confidence
        : raw.ai_confidence != null
          ? Number(raw.ai_confidence)
          : null;
    if (conf != null && Number.isFinite(conf)) {
      confidenceSum += conf;
      confidenceCount++;
    }

    let extraction: LeadReferralDocumentExtraction | null = null;
    if (raw.extracted_json && typeof raw.extracted_json === "object") {
      extraction = parseLeadReferralDocumentExtraction(raw.extracted_json);
    }

    if (extraction) {
      patient = mergePatient(patient, extraction.patient);
      payer = mergePayer(payer, extraction.payer);
      provider = mergeProvider(provider, extraction.provider);
      for (const s of extraction.services_requested) services.add(s);
      for (const m of extraction.missing_items) missingItems.add(m);
      for (const w of extraction.warnings) warnings.add(w);
      checklistSuggestions.push(...extraction.suggested_checklist_updates);
      if (extraction.summary) summaries.push(extraction.summary);
      orderDetected = orderDetected || extraction.order_detected;
      faceSheetDetected = faceSheetDetected || extraction.face_sheet_detected;
      insuranceDetected = insuranceDetected || extraction.insurance_detected;
      if (extraction.diagnoses_or_clinical_notes) {
        clinicalNotes = clinicalNotes
          ? `${clinicalNotes}\n${extraction.diagnoses_or_clinical_notes}`
          : extraction.diagnoses_or_clinical_notes;
      }
    }

    documents.push({
      id: String(raw.id),
      original_file_name: typeof raw.original_file_name === "string" ? raw.original_file_name : "file",
      document_type: docType,
      status,
      ai_processed_at: aiProcessedAt,
      ai_confidence: conf,
      ai_processing_error: aiError,
      extracted_summary: typeof raw.extracted_summary === "string" ? raw.extracted_summary : null,
      extraction,
    });
  }

  if (aiReady > 0) {
    if (!orderDetected) missingItems.add("physician order");
    if (!faceSheetDetected) missingItems.add("face sheet / demographics");
    if (!insuranceDetected) missingItems.add("insurance information");
  }

  return {
    configured: isLeadReferralDocumentAiConfigured(),
    document_count: rows.length,
    ai_ready_count: aiReady,
    ai_pending_count: aiPending,
    ai_failed_count: aiFailed,
    average_confidence: confidenceCount > 0 ? Math.round((confidenceSum / confidenceCount) * 100) / 100 : null,
    combined_summary: summaries.length ? summaries.join(" ") : null,
    patient,
    payer,
    provider,
    services_requested: [...services],
    diagnoses_or_clinical_notes: clinicalNotes || null,
    missing_items: [...missingItems],
    suggested_checklist_updates: dedupeChecklistSuggestions(checklistSuggestions),
    warnings: [...warnings],
    order_detected: orderDetected,
    face_sheet_detected: faceSheetDetected,
    insurance_detected: insuranceDetected,
    documents,
  };
}

const CHECKLIST_BOOL_MAP: Partial<Record<string, keyof UpdateReferralChecklistInput>> = {
  physician_order_received: "packet_received",
  demographics_received: "packet_received",
  referral_packet_received: "packet_received",
  face_sheet_received: "packet_received",
};

export async function applyLeadDocumentSuggestions(
  staff: StaffProfile,
  leadId: string,
  input: ApplyLeadDocumentSuggestionsInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isManagerOrHigher(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(leadId)) return { ok: false, error: "invalid_lead_id" };

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select(
      "id, contact_id, notes, primary_payer_name, payer_name, service_type, referring_provider_name, referring_doctor_name, doctor_office_name, doctor_office_phone, dob, referring_facility_id"
    )
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead?.id || !lead.contact_id) return { ok: false, error: "lead_not_found" };

  const contactId = String(lead.contact_id);
  const fields = input.selected_fields ?? {};

  const contactPatch: Record<string, string> = {};
  if (fields.patient_first_name?.trim()) contactPatch.first_name = fields.patient_first_name.trim().slice(0, 80);
  if (fields.patient_last_name?.trim()) contactPatch.last_name = fields.patient_last_name.trim().slice(0, 80);
  if (fields.patient_first_name?.trim() || fields.patient_last_name?.trim()) {
    contactPatch.full_name = [fields.patient_first_name, fields.patient_last_name]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 200);
  }
  if (fields.phone?.trim()) contactPatch.primary_phone = fields.phone.trim().slice(0, 40);
  if (fields.address_line_1?.trim()) contactPatch.address_line_1 = fields.address_line_1.trim().slice(0, 200);
  if (fields.address_line_2?.trim()) contactPatch.address_line_2 = fields.address_line_2.trim().slice(0, 200);
  if (fields.city?.trim()) contactPatch.city = fields.city.trim().slice(0, 80);
  if (fields.state?.trim()) contactPatch.state = fields.state.trim().slice(0, 2);
  if (fields.zip?.trim()) contactPatch.zip = fields.zip.trim().slice(0, 12);

  if (Object.keys(contactPatch).length > 0) {
    const { error } = await supabaseAdmin.from("contacts").update(contactPatch).eq("id", contactId);
    if (error) {
      console.warn("[lead-referral-document-ai] contact update:", error.message);
      return { ok: false, error: "contact_update_failed" };
    }
  }

  const leadPatch: Record<string, unknown> = {};
  if (fields.dob?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(fields.dob.trim())) {
    leadPatch.dob = fields.dob.trim();
  }
  if (fields.primary_payer_name?.trim()) leadPatch.primary_payer_name = fields.primary_payer_name.trim().slice(0, 120);
  if (fields.payer_name?.trim()) leadPatch.payer_name = fields.payer_name.trim().slice(0, 120);
  if (fields.service_type?.trim()) leadPatch.service_type = fields.service_type.trim().slice(0, 200);
  if (fields.referring_provider_name?.trim()) {
    leadPatch.referring_provider_name = fields.referring_provider_name.trim().slice(0, 120);
  }
  if (fields.referring_doctor_name?.trim()) {
    leadPatch.referring_doctor_name = fields.referring_doctor_name.trim().slice(0, 120);
  }
  if (fields.doctor_office_name?.trim()) {
    leadPatch.doctor_office_name = fields.doctor_office_name.trim().slice(0, 200);
  }
  if (fields.doctor_office_phone?.trim()) {
    leadPatch.doctor_office_phone = fields.doctor_office_phone.trim().slice(0, 40);
  }
  if (fields.notes?.trim()) {
    const prev = typeof lead.notes === "string" ? lead.notes.trim() : "";
    const addition = fields.notes.trim();
    leadPatch.notes = prev ? `${prev}\n\n[AI intake]\n${addition}`.slice(0, 8000) : addition.slice(0, 8000);
  }

  if (Object.keys(leadPatch).length > 0) {
    const { error } = await supabaseAdmin.from("leads").update(leadPatch).eq("id", leadId);
    if (error) {
      console.warn("[lead-referral-document-ai] lead update:", error.message);
      return { ok: false, error: "lead_update_failed" };
    }
  }

  const checklistPatch: UpdateReferralChecklistInput = {};
  const appliedCustom: Array<{ key: string; label: string; applied_at: string }> = [];

  for (const item of input.selected_checklist_updates ?? []) {
    if (!item.apply) continue;
    const mapped = CHECKLIST_BOOL_MAP[item.key];
    if (mapped) checklistPatch[mapped] = true;
    else {
      appliedCustom.push({ key: item.key, label: item.key, applied_at: new Date().toISOString() });
    }
  }

  if (Object.keys(checklistPatch).length > 0) {
    const result = await updateReferralChecklist(staff, leadId, checklistPatch);
    if (!result.ok) return { ok: false, error: result.error };
  }

  if (appliedCustom.length > 0) {
    const { data: checklistRow } = await supabaseAdmin
      .from("facility_referral_intake_checklists")
      .select("checklist_json")
      .eq("lead_id", leadId)
      .maybeSingle();
    const prevJson =
      checklistRow?.checklist_json && typeof checklistRow.checklist_json === "object"
        ? (checklistRow.checklist_json as Record<string, unknown>)
        : {};
    const prevApplied = Array.isArray(prevJson.applied_ai_checklist_completions)
      ? (prevJson.applied_ai_checklist_completions as typeof appliedCustom)
      : [];
    await supabaseAdmin
      .from("facility_referral_intake_checklists")
      .update({
        checklist_json: {
          ...prevJson,
          applied_ai_checklist_completions: [...prevApplied, ...appliedCustom],
        },
        updated_by: staff.user_id,
        updated_at: new Date().toISOString(),
      })
      .eq("lead_id", leadId);
  }

  const appliedFields = Object.keys(fields).filter((k) => {
    const v = fields[k as keyof typeof fields];
    return typeof v === "string" && v.trim();
  });

  await appendLeadActivityRow({
    leadId,
    eventType: "ai_intake_applied",
    body: `Staff applied AI document suggestions (${appliedFields.length} field${appliedFields.length === 1 ? "" : "s"}).`,
    metadata: {
      applied_fields: appliedFields,
      checklist_keys: (input.selected_checklist_updates ?? []).filter((c) => c.apply).map((c) => c.key),
      staff_note: input.notes?.trim() || null,
    },
    createdByUserId: staff.user_id,
    deletable: false,
  });

  return { ok: true };
}

export type LeadReferralDocumentAiPipelineSummary = {
  ai_reviewed_count: number;
  ai_review_needed_count: number;
  ai_missing_physician_order: boolean;
  ai_missing_insurance: boolean;
  ai_missing_demographics: boolean;
  average_ai_confidence: number | null;
};

export async function loadReferralDocumentAiSummariesByLeadIds(
  leadIds: string[]
): Promise<Map<string, LeadReferralDocumentAiPipelineSummary>> {
  const out = new Map<string, LeadReferralDocumentAiPipelineSummary>();
  const ids = leadIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return out;

  const { data, error } = await supabaseAdmin
    .from("lead_referral_documents")
    .select("lead_id, status, ai_processed_at, ai_confidence, extracted_json")
    .in("lead_id", ids)
    .neq("status", "deleted");

  if (error) {
    console.warn("[lead-referral-document-ai] pipeline batch:", error.message);
    return out;
  }

  const byLead = new Map<string, typeof data>();
  for (const row of data ?? []) {
    const lid = String((row as { lead_id: string }).lead_id);
    const list = byLead.get(lid) ?? [];
    list.push(row);
    byLead.set(lid, list);
  }

  for (const [leadId, rows] of byLead) {
    let aiReviewed = 0;
    let aiNeeded = 0;
    let confSum = 0;
    let confCount = 0;
    let orderDetected = false;
    let insuranceDetected = false;
    let faceSheetDetected = false;

    for (const row of rows ?? []) {
      const status = typeof (row as { status?: string }).status === "string" ? (row as { status: string }).status : "";
      const processed = Boolean((row as { ai_processed_at?: string }).ai_processed_at);
      if (status === "ready" && processed) aiReviewed++;
      else aiNeeded++;

      const conf = (row as { ai_confidence?: number }).ai_confidence;
      if (typeof conf === "number" && Number.isFinite(conf)) {
        confSum += conf;
        confCount++;
      }

      const extraction = parseLeadReferralDocumentExtraction((row as { extracted_json?: unknown }).extracted_json);
      if (extraction) {
        orderDetected = orderDetected || extraction.order_detected;
        insuranceDetected = insuranceDetected || extraction.insurance_detected;
        faceSheetDetected = faceSheetDetected || extraction.face_sheet_detected;
      }
    }

    out.set(leadId, {
      ai_reviewed_count: aiReviewed,
      ai_review_needed_count: aiNeeded,
      ai_missing_physician_order: !orderDetected,
      ai_missing_insurance: !insuranceDetected,
      ai_missing_demographics: !faceSheetDetected,
      average_ai_confidence: confCount > 0 ? Math.round((confSum / confCount) * 100) / 100 : null,
    });
  }

  return out;
}
