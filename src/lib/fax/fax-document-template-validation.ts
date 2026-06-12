import { isFaxPacketFile } from "@/lib/fax/fax-packet-pdf";

export const FAX_DOCUMENT_TEMPLATE_CONTENT_ERROR = "Paste template text or upload a file to continue.";

export const FAX_DOCUMENT_TEMPLATE_NAME_ERROR = "Template name is required.";

export const FAX_DOCUMENT_TEMPLATE_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function hasDocumentTemplateText(bodyText: string | null | undefined): boolean {
  return typeof bodyText === "string" && bodyText.trim().length > 0;
}

export function hasDocumentTemplateFile(file: File | null | undefined): boolean {
  return file instanceof File && file.size > 0;
}

export function hasStoredDocumentTemplateAttachment(row: {
  attachment_storage_path?: string | null;
}): boolean {
  return typeof row.attachment_storage_path === "string" && row.attachment_storage_path.trim().length > 0;
}

export function validateDocumentTemplateContent(input: {
  bodyText: string | null | undefined;
  file?: File | null;
  existingAttachmentPath?: string | null;
}): string | null {
  if (
    hasDocumentTemplateText(input.bodyText) ||
    hasDocumentTemplateFile(input.file) ||
    hasStoredDocumentTemplateAttachment({ attachment_storage_path: input.existingAttachmentPath })
  ) {
    return null;
  }
  return FAX_DOCUMENT_TEMPLATE_CONTENT_ERROR;
}

export function validateDocumentTemplateAttachmentFile(file: File): string | null {
  if (!isFaxPacketFile(file)) {
    return "Only PDF, JPEG, and PNG files are supported.";
  }
  if (file.size > FAX_DOCUMENT_TEMPLATE_MAX_ATTACHMENT_BYTES) {
    return `File is too large (max ${Math.round(FAX_DOCUMENT_TEMPLATE_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB).`;
  }
  return null;
}
