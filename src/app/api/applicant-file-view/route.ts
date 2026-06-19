import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  isAllowedApplicantUploadDocumentType,
  normalizeApplicantUploadDocumentType,
} from "@/lib/applicant-file-upload-types";

const APPLICANT_FILES_BUCKET = "applicant-files";

/**
 * Applicant onboarding file view (same trust model as `/api/upload-applicant-file`).
 * Used for headshot preview in the employee portal; admins use `/api/admin/employee-documents/download`.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const applicantId = url.searchParams.get("applicantId")?.trim();
    const documentTypeRaw = url.searchParams.get("documentType")?.trim();
    const documentType = documentTypeRaw
      ? normalizeApplicantUploadDocumentType(documentTypeRaw)
      : "";
    const inline =
      url.searchParams.get("inline") === "1" || url.searchParams.get("inline") === "true";

    if (!applicantId || !documentType) {
      return NextResponse.json(
        { error: "Missing applicantId or documentType" },
        { status: 400 }
      );
    }

    if (!isAllowedApplicantUploadDocumentType(documentType)) {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
    }

    const { data: fileRow, error } = await supabaseAdmin
      .from("applicant_files")
      .select("file_path, file_name, file_type")
      .eq("applicant_id", applicantId)
      .eq("document_type", documentType)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        file_path?: string | null;
        file_name?: string | null;
        file_type?: string | null;
      }>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!fileRow?.file_path) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data, error: downloadError } = await supabaseAdmin.storage
      .from(APPLICANT_FILES_BUCKET)
      .download(fileRow.file_path);

    if (downloadError || !data) {
      return NextResponse.json(
        { error: downloadError?.message || "Failed to download document" },
        { status: 500 }
      );
    }

    const bytes = Buffer.from(await data.arrayBuffer());
    const safeName = (fileRow.file_name || "document")
      .replace(/[^\w.\- ()\[\]+@]/g, "_")
      .slice(0, 180);
    const contentType = fileRow.file_type || data.type || "application/octet-stream";
    const disposition = inline
      ? `inline; filename="${safeName}"`
      : `attachment; filename="${safeName}"`;

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load document",
      },
      { status: 500 }
    );
  }
}
