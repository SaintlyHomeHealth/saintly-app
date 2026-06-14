import { NextResponse } from "next/server";

import { hashClientIp } from "@/lib/crm/facility-referral-source-links";
import {
  notifyLeadReferralDocumentReviewNeeded,
  notifyLeadReferralDocumentsUploaded,
  notifyLeadReferralDocumentUploadFailed,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import {
  isAllowedLeadReferralDocumentContentType,
  isLeadReferralDocumentType,
  LEAD_REFERRAL_DOCUMENT_MAX_BYTES,
  LEAD_REFERRAL_DOCUMENT_MAX_FILES,
} from "@/lib/crm/lead-referral-documents-constants";
import {
  publicReferralDocumentErrorMessage,
  uploadLeadReferralDocuments,
} from "@/lib/crm/lead-referral-documents";
import { submitPublicReferral } from "@/lib/crm/public-referral-submit";
import {
  publicReferralErrorMessage,
  validatePublicReferralPayload,
  validatePublicReferralPayloadFromFormData,
} from "@/lib/crm/public-referral-types";

export type PublicReferralSubmitResponse =
  | {
      ok: true;
      matched: boolean;
      needs_review: boolean;
      documents_uploaded?: number;
      document_warning?: string;
    }
  | { ok: false; error: string; message: string; field?: string };

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip");
}

function parseDocumentTypesJson(raw: string | null): (string | null)[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => (typeof v === "string" && isLeadReferralDocumentType(v) ? v : null));
  } catch {
    return [];
  }
}

async function handleDocumentUploads(
  req: Request,
  formData: FormData | null,
  leadContext: {
    leadId: string;
    facilityId: string | null;
    contactId: string | null;
    sourceLinkId: string | null;
    patientName: string;
    facilityName: string | null;
    intakeOwnerUserId: string | null;
    salesRepUserId: string | null;
  }
): Promise<{ uploaded: number; warning: string | null }> {
  if (!formData) return { uploaded: 0, warning: null };

  const files = formData.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { uploaded: 0, warning: null };

  if (files.length > LEAD_REFERRAL_DOCUMENT_MAX_FILES) {
    queueFacilityNotification(() =>
      notifyLeadReferralDocumentUploadFailed({
        leadId: leadContext.leadId,
        facilityId: leadContext.facilityId,
        patientName: leadContext.patientName,
        intakeOwnerUserId: leadContext.intakeOwnerUserId,
      })
    );
    return {
      uploaded: 0,
      warning: publicReferralDocumentErrorMessage("too_many_files"),
    };
  }

  for (const file of files) {
    if (file.size > LEAD_REFERRAL_DOCUMENT_MAX_BYTES) {
      queueFacilityNotification(() =>
        notifyLeadReferralDocumentUploadFailed({
          leadId: leadContext.leadId,
          facilityId: leadContext.facilityId,
          patientName: leadContext.patientName,
          intakeOwnerUserId: leadContext.intakeOwnerUserId,
        })
      );
      return { uploaded: 0, warning: publicReferralDocumentErrorMessage("file_too_large") };
    }
    const mime = file.type.trim() || "application/octet-stream";
    if (!isAllowedLeadReferralDocumentContentType(mime)) {
      return { uploaded: 0, warning: publicReferralDocumentErrorMessage("invalid_type") };
    }
  }

  const typesRaw = formData.get("document_types");
  const types = parseDocumentTypesJson(typeof typesRaw === "string" ? typesRaw : null);

  const result = await uploadLeadReferralDocuments(
    {
      leadId: leadContext.leadId,
      facilityId: leadContext.facilityId,
      contactId: leadContext.contactId,
      sourceLinkId: leadContext.sourceLinkId,
      uploadedByPublic: true,
    },
    files.map((file, i) => ({
      file,
      fileName: file.name,
      mimeType: file.type.trim() || "application/octet-stream",
      fileSize: file.size,
      documentType: types[i] ?? null,
    }))
  );

  if (!result.ok) {
    queueFacilityNotification(() =>
      notifyLeadReferralDocumentUploadFailed({
        leadId: leadContext.leadId,
        facilityId: leadContext.facilityId,
        patientName: leadContext.patientName,
        intakeOwnerUserId: leadContext.intakeOwnerUserId,
      })
    );
    return { uploaded: 0, warning: publicReferralDocumentErrorMessage(result.error) };
  }

  const uploadedCount = result.uploaded.length;
  if (uploadedCount > 0) {
    queueFacilityNotification(() =>
      notifyLeadReferralDocumentsUploaded({
        leadId: leadContext.leadId,
        facilityId: leadContext.facilityId,
        facilityName: leadContext.facilityName,
        patientName: leadContext.patientName,
        documentCount: uploadedCount,
        intakeOwnerUserId: leadContext.intakeOwnerUserId,
        salesRepUserId: leadContext.salesRepUserId,
      })
    );
    queueFacilityNotification(() =>
      notifyLeadReferralDocumentReviewNeeded({
        leadId: leadContext.leadId,
        facilityId: leadContext.facilityId,
        patientName: leadContext.patientName,
        documentCount: uploadedCount,
        intakeOwnerUserId: leadContext.intakeOwnerUserId,
      })
    );
  }

  if (result.failed.length > 0 && uploadedCount === 0) {
    queueFacilityNotification(() =>
      notifyLeadReferralDocumentUploadFailed({
        leadId: leadContext.leadId,
        facilityId: leadContext.facilityId,
        patientName: leadContext.patientName,
        intakeOwnerUserId: leadContext.intakeOwnerUserId,
      })
    );
    return {
      uploaded: 0,
      warning: publicReferralDocumentErrorMessage("upload_failed"),
    };
  }

  if (result.failed.length > 0) {
    return {
      uploaded: uploadedCount,
      warning: publicReferralErrorMessage("document_upload_partial"),
    };
  }

  return { uploaded: uploadedCount, warning: null };
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");

  let formData: FormData | null = null;
  let validated:
    | { ok: true; payload: import("@/lib/crm/public-referral-types").PublicReferralSubmitPayload }
    | { error: string; field?: string };

  if (isMultipart) {
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_form",
          message: publicReferralErrorMessage("invalid_json"),
        } satisfies PublicReferralSubmitResponse,
        { status: 400 }
      );
    }
    validated = validatePublicReferralPayloadFromFormData(formData);
  } else {
    let raw: Record<string, unknown>;
    try {
      raw = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_json",
          message: publicReferralErrorMessage("invalid_json"),
        } satisfies PublicReferralSubmitResponse,
        { status: 400 }
      );
    }
    validated = validatePublicReferralPayload(raw);
  }

  if (!("ok" in validated) || !validated.ok) {
    const err = validated as { error: string; field?: string };
    return NextResponse.json(
      {
        ok: false,
        error: err.error,
        message: publicReferralErrorMessage(err.error),
        field: err.field,
      } satisfies PublicReferralSubmitResponse,
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const ipHash = hashClientIp(ip);

  try {
    const result = await submitPublicReferral({
      payload: validated.payload,
      ipHash,
      userAgent: req.headers.get("user-agent"),
      referrer: req.headers.get("referer"),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          message: publicReferralErrorMessage(result.error),
          field: result.field,
        } satisfies PublicReferralSubmitResponse,
        { status: result.error === "rate_limited" ? 429 : 500 }
      );
    }

    const docResult = await handleDocumentUploads(req, formData, {
      leadId: result.lead_id,
      facilityId: result.facility_id,
      contactId: result.contact_id,
      sourceLinkId: result.source_link_id,
      patientName: result.patient_name,
      facilityName: result.facility_name,
      intakeOwnerUserId: result.intake_owner_user_id,
      salesRepUserId: result.sales_rep_user_id,
    });

    return NextResponse.json({
      ok: true,
      matched: result.matched,
      needs_review: result.needs_review,
      documents_uploaded: docResult.uploaded,
      document_warning: docResult.warning ?? undefined,
    } satisfies PublicReferralSubmitResponse);
  } catch (e) {
    console.warn("[public/referrals] submit:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: publicReferralErrorMessage("server_error"),
      } satisfies PublicReferralSubmitResponse,
      { status: 500 }
    );
  }
}
