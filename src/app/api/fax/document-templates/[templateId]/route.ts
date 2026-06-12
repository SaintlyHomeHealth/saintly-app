import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  FAX_DOCUMENT_TEMPLATES_BUCKET,
  getFaxDocumentTemplateById,
  missingFaxDocumentTemplateSchema,
  removeDocumentTemplateAttachment,
  uploadDocumentTemplateAttachment,
} from "@/lib/fax/fax-document-templates-server";
import {
  FAX_DOCUMENT_TEMPLATE_CONTENT_ERROR,
  FAX_DOCUMENT_TEMPLATE_NAME_ERROR,
  validateDocumentTemplateContent,
} from "@/lib/fax/fax-document-template-validation";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function fileValue(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

type RouteCtx = { params: Promise<{ templateId: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await ctx.params;
  try {
    const template = await getFaxDocumentTemplateById(templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load template.";
    if (missingFaxDocumentTemplateSchema(err instanceof Error ? { message } : null)) {
      return NextResponse.json({ error: "Fax document template migration not applied." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await ctx.params;
  const existing = await getFaxDocumentTemplateById(templateId);
  if (!existing) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const name = textValue(form.get("name")).trim();
  const bodyText = textValue(form.get("bodyText"));
  const attachment = fileValue(form.get("attachment"));
  const removeAttachment = textValue(form.get("removeAttachment")).trim() === "1";

  if (!name) {
    return NextResponse.json({ error: FAX_DOCUMENT_TEMPLATE_NAME_ERROR }, { status: 400 });
  }

  const contentError = validateDocumentTemplateContent({
    bodyText,
    file: attachment,
    existingAttachmentPath: removeAttachment ? null : existing.attachment_storage_path,
  });
  if (contentError) {
    return NextResponse.json({ error: contentError }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    name,
    body_content: bodyText,
  };

  let oldPathToRemove: string | null = null;

  if (removeAttachment && existing.attachment_storage_path) {
    oldPathToRemove = existing.attachment_storage_path;
    patch.attachment_storage_bucket = null;
    patch.attachment_storage_path = null;
    patch.attachment_file_name = null;
    patch.attachment_content_type = null;
    patch.attachment_size_bytes = null;
  }

  if (attachment) {
    try {
      const uploaded = await uploadDocumentTemplateAttachment({ templateId, file: attachment });
      if (existing.attachment_storage_path) {
        oldPathToRemove = existing.attachment_storage_path;
      }
      patch.attachment_storage_bucket = uploaded.storage_bucket;
      patch.attachment_storage_path = uploaded.storage_path;
      patch.attachment_file_name = uploaded.file_name;
      patch.attachment_content_type = uploaded.content_type;
      patch.attachment_size_bytes = uploaded.size_bytes;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Attachment upload failed.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("fax_document_templates")
    .update(patch)
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) {
    if (missingFaxDocumentTemplateSchema(error)) {
      return NextResponse.json({ error: "Fax document template migration not applied." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (oldPathToRemove) {
    await removeDocumentTemplateAttachment(oldPathToRemove);
  }

  return NextResponse.json({ ok: true, template: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await ctx.params;
  const existing = await getFaxDocumentTemplateById(templateId);
  if (!existing) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from("fax_document_templates").delete().eq("id", templateId);
  if (error) {
    if (missingFaxDocumentTemplateSchema(error)) {
      return NextResponse.json({ error: "Fax document template migration not applied." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (existing.attachment_storage_path) {
    await removeDocumentTemplateAttachment(existing.attachment_storage_path);
  }

  return NextResponse.json({ ok: true });
}
