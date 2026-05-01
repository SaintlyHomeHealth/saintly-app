import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { PDF_SIGN_BUCKETS } from "@/lib/pdf-sign/constants";
import { renderSignedPdf, type RenderFieldInput } from "@/lib/pdf-sign/render-pdf";

/**
 * Renders the current saved field values (recipient + staff) onto the template PDF.
 */
export async function renderPacketDocumentPreview(packetDocumentId: string): Promise<{
  pdfBytes: Uint8Array;
  sha256: string;
  template: { storage_bucket: string; storage_object_path: string };
}> {
  const { data: doc, error: dErr } = await supabaseAdmin
    .from("signature_packet_documents")
    .select("id, template_id, packet_id")
    .eq("id", packetDocumentId)
    .maybeSingle();
  if (dErr || !doc) throw new Error("Packet document not found.");

  const { data: template, error: tErr } = await supabaseAdmin
    .from("signature_templates")
    .select("id, storage_bucket, storage_object_path")
    .eq("id", doc.template_id)
    .maybeSingle();
  if (tErr || !template) throw new Error("Template not found.");

  const { data: fields, error: fErr } = await supabaseAdmin
    .from("signature_template_fields")
    .select(
      "id, field_key, field_type, pdf_acroform_field_name, page_index, x, y, font_size"
    )
    .eq("template_id", template.id);
  if (fErr || !fields?.length) throw new Error("No template fields.");

  const { data: valueRows } = await supabaseAdmin
    .from("signature_field_values")
    .select("template_field_id, text_value, bool_value")
    .eq("packet_document_id", packetDocumentId);

  const byTf = new Map<string, { text_value: string | null; bool_value: boolean | null }>(
    (valueRows || []).map((r) => [
      r.template_field_id,
      { text_value: r.text_value, bool_value: r.bool_value },
    ])
  );

  const { data: recipientRows } = await supabaseAdmin
    .from("signature_recipients")
    .select("id")
    .eq("packet_id", doc.packet_id)
    .limit(1);
  const recipientId = recipientRows?.[0]?.id || null;

  let sensMap = new Map<string, string>();
  if (recipientId) {
    const { data: sens } = await supabaseAdmin
      .from("sensitive_document_values")
      .select("field_key, ciphertext")
      .eq("packet_document_id", packetDocumentId)
      .eq("recipient_id", recipientId);
    sensMap = new Map((sens || []).map((r) => [r.field_key, r.ciphertext]));
  }

  const renderFields: RenderFieldInput[] = fields.map((f) => {
    const stored = byTf.get(f.id);
    let text: string | null = null;
    if (f.field_type === "checkbox") {
      const b = stored?.bool_value === true || stored?.text_value === "true";
      text = b ? "true" : "false";
    } else {
      text = stored?.text_value ?? null;
    }
    return {
      field_key: f.field_key,
      field_type: f.field_type,
      pdf_acroform_field_name: f.pdf_acroform_field_name,
      page_index: f.page_index,
      x: f.x,
      y: f.y,
      font_size: f.font_size,
      text_value: f.field_type === "tin" ? null : text,
      tin_ciphertext: f.field_type === "tin" ? sensMap.get(f.field_key) ?? null : null,
    };
  });

  const { data: templateFile, error: dlErr } = await supabaseAdmin.storage
    .from(template.storage_bucket || PDF_SIGN_BUCKETS.templates)
    .download(template.storage_object_path);
  if (dlErr || !templateFile) throw new Error("Template download failed.");

  const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
  const { pdfBytes, sha256 } = await renderSignedPdf({ templateBytes, fields: renderFields });
  return {
    pdfBytes,
    sha256,
    template: {
      storage_bucket: template.storage_bucket,
      storage_object_path: template.storage_object_path,
    },
  };
}
