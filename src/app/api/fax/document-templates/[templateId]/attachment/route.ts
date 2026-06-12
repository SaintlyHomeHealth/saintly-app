import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  FAX_DOCUMENT_TEMPLATES_BUCKET,
  getFaxDocumentTemplateById,
  missingFaxDocumentTemplateSchema,
} from "@/lib/fax/fax-document-templates-server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ templateId: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await ctx.params;
  const wantsJson = req.nextUrl.searchParams.get("format") === "json";
  try {
    const template = await getFaxDocumentTemplateById(templateId);
    if (!template?.attachment_storage_path) {
      return NextResponse.json({ error: "No attachment on this template." }, { status: 404 });
    }

    const bucket = template.attachment_storage_bucket || FAX_DOCUMENT_TEMPLATES_BUCKET;
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(template.attachment_storage_path, 60 * 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || "Could not open attachment." }, { status: 500 });
    }

    if (wantsJson) {
      return NextResponse.json({
        ok: true,
        url: data.signedUrl,
        fileName: template.attachment_file_name,
        contentType: template.attachment_content_type,
      });
    }

    return NextResponse.redirect(data.signedUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load attachment.";
    if (missingFaxDocumentTemplateSchema(err instanceof Error ? { message } : null)) {
      return NextResponse.json({ error: "Fax document template migration not applied." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
