import "server-only";

import { randomUUID } from "crypto";

import { supabaseAdmin } from "@/lib/admin";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";
import type { FaxDocumentTemplateRow } from "@/lib/fax/fax-document-template-types";
import { validateDocumentTemplateAttachmentFile } from "@/lib/fax/fax-document-template-validation";

export const FAX_DOCUMENT_TEMPLATES_BUCKET = "fax-documents";

export function missingFaxDocumentTemplateSchema(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (isMissingSchemaObjectError(error)) return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("fax_document_templates");
}

export async function listFaxDocumentTemplates(): Promise<FaxDocumentTemplateRow[]> {
  const { data, error } = await supabaseAdmin
    .from("fax_document_templates")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FaxDocumentTemplateRow[];
}

export async function getFaxDocumentTemplateById(id: string): Promise<FaxDocumentTemplateRow | null> {
  const { data, error } = await supabaseAdmin
    .from("fax_document_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as FaxDocumentTemplateRow | null) ?? null;
}

function safeAttachmentFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "attachment";
}

export async function uploadDocumentTemplateAttachment(input: {
  templateId: string;
  file: File;
}): Promise<{
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
}> {
  const attachmentError = validateDocumentTemplateAttachmentFile(input.file);
  if (attachmentError) {
    throw new Error(attachmentError);
  }

  const attachmentId = randomUUID();
  const safeName = safeAttachmentFileName(input.file.name);
  const storagePath = `document-templates/${input.templateId}/${attachmentId}-${safeName}`;
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const contentType = input.file.type || "application/octet-stream";

  const { error: upErr } = await supabaseAdmin.storage
    .from(FAX_DOCUMENT_TEMPLATES_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });
  if (upErr) {
    throw new Error(upErr.message);
  }

  return {
    storage_bucket: FAX_DOCUMENT_TEMPLATES_BUCKET,
    storage_path: storagePath,
    file_name: input.file.name.slice(0, 200),
    content_type: contentType,
    size_bytes: input.file.size,
  };
}

export async function removeDocumentTemplateAttachment(path: string | null | undefined): Promise<void> {
  if (!path?.trim()) return;
  await supabaseAdmin.storage.from(FAX_DOCUMENT_TEMPLATES_BUCKET).remove([path.trim()]);
}
