import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLog } from "@/lib/audit-log";
import { getStaffProfile } from "@/lib/staff-profile";
import { getAuthenticatedUser } from "@/lib/supabase/server";

type DocumentSource = "applicant_file" | "legacy_document";

function getStorageObjectFromPublicUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;

  const match = fileUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match?.[2]) return null;

  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2]),
  };
}

function parseSource(value: string | null): DocumentSource | null {
  if (value === "applicant_file" || value === "legacy_document") return value;
  return null;
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staffProfile = await getStaffProfile();
  if (!staffProfile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const recordId = url.searchParams.get("recordId");
    const source = parseSource(url.searchParams.get("source"));

    if (!recordId || !source) {
      return NextResponse.json(
        { error: "Missing record id or source" },
        { status: 400 }
      );
    }

    if (source === "applicant_file") {
      const { data: fileRow, error: fileError } = await supabaseAdmin
        .from("applicant_files")
        .select("id, applicant_id, document_type, file_path, file_name")
        .eq("id", recordId)
        .maybeSingle<{
          id: string;
          applicant_id: string;
          document_type?: string | null;
          file_path?: string | null;
          file_name?: string | null;
        }>();

      if (fileError) {
        return NextResponse.json({ error: fileError.message }, { status: 500 });
      }

      if (!fileRow) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      if (fileRow.file_path) {
        await supabaseAdmin.storage.from("applicant-files").remove([fileRow.file_path]);
      }

      const { error: deleteError } = await supabaseAdmin
        .from("applicant_files")
        .delete()
        .eq("id", recordId);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      if ((fileRow.document_type || "").toLowerCase().trim() === "auto_insurance") {
        const { data: remainingAutoInsurance } = await supabaseAdmin
          .from("applicant_files")
          .select("file_path")
          .eq("applicant_id", fileRow.applicant_id)
          .eq("document_type", "auto_insurance")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ file_path?: string | null }>();

        await supabaseAdmin
          .from("applicants")
          .update({
            auto_insurance_file: remainingAutoInsurance?.file_path || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", fileRow.applicant_id);
      }

      await insertAuditLog({
        action: "employee_document_remove",
        entityType: "applicant_file",
        entityId: recordId,
        metadata: {
          applicant_id: fileRow.applicant_id,
          source,
          document_type: fileRow.document_type || null,
          file_name: fileRow.file_name || null,
        },
      });

      return NextResponse.json({ ok: true });
    }

    const { data: legacyRow, error: legacyError } = await supabaseAdmin
      .from("documents")
      .select("id, applicant_id, document_type, file_url")
      .eq("id", recordId)
      .maybeSingle<{
        id: string;
        applicant_id: string;
        document_type?: string | null;
        file_url?: string | null;
      }>();

    if (legacyError) {
      return NextResponse.json({ error: legacyError.message }, { status: 500 });
    }

    if (!legacyRow) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const storageObject = getStorageObjectFromPublicUrl(legacyRow.file_url);
    if (storageObject) {
      await supabaseAdmin.storage.from(storageObject.bucket).remove([storageObject.path]);
    }

    const { error: deleteLegacyError } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", recordId);

    if (deleteLegacyError) {
      return NextResponse.json({ error: deleteLegacyError.message }, { status: 500 });
    }

    await insertAuditLog({
      action: "employee_document_remove",
      entityType: "document",
      entityId: recordId,
      metadata: {
        applicant_id: legacyRow.applicant_id,
        source,
        document_type: legacyRow.document_type || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to remove document",
      },
      { status: 500 }
    );
  }
}
