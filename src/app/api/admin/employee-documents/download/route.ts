import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile } from "@/lib/staff-profile";
import { getAuthenticatedUser } from "@/lib/supabase/server";

type DocumentSource = "applicant_file" | "legacy_document";

function parseSource(value: string | null): DocumentSource | null {
  if (value === "applicant_file" || value === "legacy_document") return value;
  return null;
}

function getStorageObjectFromPublicUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;

  const match = fileUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match?.[2]) return null;

  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2]),
  };
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staffProfile = await getStaffProfile();
  if (!staffProfile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const recordId = url.searchParams.get("recordId");
  const source = parseSource(url.searchParams.get("source"));

  if (!recordId || !source) {
    return NextResponse.json({ error: "Missing record id or source" }, { status: 400 });
  }

  try {
    if (source === "applicant_file") {
      const { data: fileRow, error } = await supabaseAdmin
        .from("applicant_files")
        .select("file_path, file_name, file_type")
        .eq("id", recordId)
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
        .from("applicant-files")
        .download(fileRow.file_path);

      if (downloadError || !data) {
        return NextResponse.json(
          { error: downloadError?.message || "Failed to download document" },
          { status: 500 }
        );
      }

      const bytes = Buffer.from(await data.arrayBuffer());
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": fileRow.file_type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileRow.file_name || "document"}"`,
        },
      });
    }

    const { data: legacyRow, error } = await supabaseAdmin
      .from("documents")
      .select("file_url, document_type")
      .eq("id", recordId)
      .maybeSingle<{
        file_url?: string | null;
        document_type?: string | null;
      }>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const storageObject = getStorageObjectFromPublicUrl(legacyRow?.file_url);
    if (!storageObject) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data, error: downloadError } = await supabaseAdmin.storage
      .from(storageObject.bucket)
      .download(storageObject.path);

    if (downloadError || !data) {
      return NextResponse.json(
        { error: downloadError?.message || "Failed to download document" },
        { status: 500 }
      );
    }

    const bytes = Buffer.from(await data.arrayBuffer());
    const fileName = `${(legacyRow?.document_type || "document").trim() || "document"}.pdf`;
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": data.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to download document",
      },
      { status: 500 }
    );
  }
}
