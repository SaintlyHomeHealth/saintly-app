import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  listFaxDocumentTemplates,
  missingFaxDocumentTemplateSchema,
  removeDocumentTemplateAttachment,
  uploadDocumentTemplateAttachment,
} from "@/lib/fax/fax-document-templates-server";
import {
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

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const templates = await listFaxDocumentTemplates();
    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load templates.";
    if (missingFaxDocumentTemplateSchema(err instanceof Error ? { message } : null)) {
      return NextResponse.json({ ok: true, templates: [], schema_missing: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  if (!name) {
    return NextResponse.json({ error: FAX_DOCUMENT_TEMPLATE_NAME_ERROR }, { status: 400 });
  }

  const contentError = validateDocumentTemplateContent({ bodyText, file: attachment });
  if (contentError) {
    return NextResponse.json({ error: contentError }, { status: 400 });
  }

  const templateId = randomUUID();
  let attachmentMeta:
    | {
        attachment_storage_bucket: string;
        attachment_storage_path: string;
        attachment_file_name: string;
        attachment_content_type: string;
        attachment_size_bytes: number;
      }
    | null = null;

  if (attachment) {
    try {
      const uploaded = await uploadDocumentTemplateAttachment({ templateId, file: attachment });
      attachmentMeta = {
        attachment_storage_bucket: uploaded.storage_bucket,
        attachment_storage_path: uploaded.storage_path,
        attachment_file_name: uploaded.file_name,
        attachment_content_type: uploaded.content_type,
        attachment_size_bytes: uploaded.size_bytes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Attachment upload failed.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("fax_document_templates")
    .insert({
      id: templateId,
      name,
      body_content: bodyText,
      created_by_user_id: staff.user_id,
      ...(attachmentMeta ?? {}),
    })
    .select("*")
    .single();

  if (error) {
    if (attachmentMeta?.attachment_storage_path) {
      await removeDocumentTemplateAttachment(attachmentMeta.attachment_storage_path);
    }
    if (missingFaxDocumentTemplateSchema(error)) {
      return NextResponse.json({ error: "Fax document template migration not applied." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, template: data, templateId: data.id });
}
