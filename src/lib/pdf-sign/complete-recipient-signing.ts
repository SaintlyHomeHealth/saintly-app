import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { PDF_SIGN_BUCKETS } from "@/lib/pdf-sign/constants";
import { encryptSensitiveField } from "@/lib/pdf-sign/field-crypto";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import { renderSignedPdf, type RenderFieldInput } from "@/lib/pdf-sign/render-pdf";
import { hashSignToken } from "@/lib/pdf-sign/token";

function isOptionalField(options: unknown): boolean {
  if (!options || typeof options !== "object") return false;
  return (options as { optional?: boolean }).optional === true;
}

function publicPacketDocumentPath(packetId: string, docId: string) {
  return `packets/${packetId}/doc-${docId}.pdf`;
}

export async function attachCompletedPdfToApplicant(input: {
  applicantId: string;
  packetId: string;
  pdfBytes: Uint8Array;
  documentLabel: string;
  documentType: string;
}): Promise<void> {
  const filePath = `applicants/${input.applicantId}/pdf-sign-${input.packetId}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from("applicant-files")
    .upload(filePath, input.pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    throw uploadError;
  }
  const { error: insertError } = await supabaseAdmin.from("applicant_files").insert({
    applicant_id: input.applicantId,
    document_type: input.documentType,
    display_name: input.documentLabel,
    file_name: `${input.documentLabel}.pdf`,
    file_path: filePath,
    storage_path: filePath,
    file_type: "application/pdf",
    file_size: input.pdfBytes.length,
    required: false,
  });
  if (insertError) {
    throw insertError;
  }
}

export async function saveRecipientFieldDraft(input: {
  tokenHash: string;
  values: Record<string, string | boolean>;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const loaded = await loadRecipientContextByTokenHash(input.tokenHash);
  if (!loaded) return { ok: false, error: "Invalid or expired link.", status: 404 };
  const { recipient, packet, packetDocument, template, fields } = loaded;

  if (packet.voided_at) return { ok: false, error: "This packet was voided.", status: 410 };
  if (packet.status === "completed" || packet.status === "signed") {
    return { ok: false, error: "This document is already signed.", status: 409 };
  }
  if (new Date(recipient.token_expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("signature_packets").update({ status: "expired" }).eq("id", packet.id);
    return { ok: false, error: "This link has expired.", status: 410 };
  }

  await persistFieldValues({
    recipientId: recipient.id,
    packetDocumentId: packetDocument.id,
    templateFields: fields,
    values: input.values,
  });

  const nextStatus =
    packet.status === "viewed" || packet.status === "sent" ? "in_progress" : packet.status;
  if (nextStatus !== packet.status) {
    await supabaseAdmin.from("signature_packets").update({ status: nextStatus }).eq("id", packet.id);
  }

  await logSignatureEvent({
    packetId: packet.id,
    recipientId: recipient.id,
    actor: "recipient",
    action: "edit",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    templateVersion: template.version,
    metadata: { field_keys: Object.keys(input.values) },
  });

  return { ok: true };
}

type LoadedRecipientContext = {
  recipient: {
    id: string;
    email: string;
    display_name: string | null;
    token_expires_at: string;
    signed_at: string | null;
    packet_id: string;
  };
  packet: {
    id: string;
    status: string;
    primary_document_type: string;
    voided_at: string | null;
    crm_entity_type: string;
    crm_entity_id: string;
    metadata: Record<string, unknown>;
    i9_case_id: string | null;
    i9_section: string | null;
  };
  packetDocument: { id: string; template_id: string; template_version_snapshot: number };
  template: {
    id: string;
    document_type: string;
    storage_bucket: string;
    storage_object_path: string;
    version: number;
  };
  fields: Array<{
    id: string;
    field_key: string;
    label: string;
    field_type: string;
    pdf_acroform_field_name: string | null;
    page_index: number;
    x: number | null;
    y: number | null;
    font_size: number;
    options: unknown;
    required_order: number;
  }>;
};

export async function loadRecipientContextByTokenHash(
  tokenHash: string
): Promise<LoadedRecipientContext | null> {
  const { data: recipient, error: rErr } = await supabaseAdmin
    .from("signature_recipients")
    .select("id, email, display_name, token_expires_at, signed_at, packet_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (rErr || !recipient) return null;

  const { data: packet, error: pErr } = await supabaseAdmin
    .from("signature_packets")
    .select(
      "id, status, primary_document_type, voided_at, crm_entity_type, crm_entity_id, metadata, i9_case_id, i9_section"
    )
    .eq("id", recipient.packet_id)
    .maybeSingle();
  if (pErr || !packet) return null;

  const { data: packetDocument, error: dErr } = await supabaseAdmin
    .from("signature_packet_documents")
    .select("id, template_id, template_version_snapshot")
    .eq("packet_id", packet.id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (dErr || !packetDocument) return null;

  const { data: template, error: tErr } = await supabaseAdmin
    .from("signature_templates")
    .select("id, document_type, storage_bucket, storage_object_path, version")
    .eq("id", packetDocument.template_id)
    .maybeSingle();
  if (tErr || !template) return null;

  const { data: fields, error: fErr } = await supabaseAdmin
    .from("signature_template_fields")
    .select(
      "id, field_key, label, field_type, pdf_acroform_field_name, page_index, x, y, font_size, options, required_order"
    )
    .eq("template_id", template.id)
    .order("required_order", { ascending: true });
  if (fErr || !fields?.length) return null;

  return {
    recipient,
    packet: {
      ...packet,
      metadata: (packet.metadata as Record<string, unknown>) || {},
    },
    packetDocument,
    template,
    fields,
  };
}

async function persistFieldValues(input: {
  recipientId: string;
  packetDocumentId: string;
  templateFields: LoadedRecipientContext["fields"];
  values: Record<string, string | boolean>;
}) {
  for (const f of input.templateFields) {
    if (!(f.field_key in input.values)) continue;
    const raw = input.values[f.field_key];
    if (f.field_type === "tin") {
      const s = String(raw ?? "").trim();
      if (!s) continue;
      const { ciphertext, last4 } = encryptSensitiveField(s);
      await supabaseAdmin.from("sensitive_document_values").upsert(
        {
          recipient_id: input.recipientId,
          packet_document_id: input.packetDocumentId,
          field_key: f.field_key,
          ciphertext,
          last4,
        },
        { onConflict: "recipient_id,packet_document_id,field_key" }
      );
      await supabaseAdmin.from("signature_field_values").upsert(
        {
          packet_document_id: input.packetDocumentId,
          template_field_id: f.id,
          recipient_id: input.recipientId,
          text_value: `***-**-${last4}`,
          bool_value: null,
          set_by_staff_user_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "packet_document_id,template_field_id" }
      );
      continue;
    }

    const textValue =
      f.field_type === "checkbox"
        ? raw === true || raw === "true" || raw === "yes"
          ? "true"
          : "false"
        : String(raw ?? "").trim();

    await supabaseAdmin.from("signature_field_values").upsert(
      {
        packet_document_id: input.packetDocumentId,
        template_field_id: f.id,
        recipient_id: input.recipientId,
        text_value: textValue,
        bool_value: f.field_type === "checkbox" ? textValue === "true" : null,
        set_by_staff_user_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "packet_document_id,template_field_id" }
    );
  }
}

function validateRequired(
  fields: LoadedRecipientContext["fields"],
  values: Record<string, string | boolean>,
  hasTin: (key: string) => boolean
): string | null {
  for (const f of fields) {
    if (isOptionalField(f.options)) continue;
    const v = values[f.field_key];
    if (f.field_type === "tin") {
      if (!hasTin(f.field_key) && (v == null || String(v).replace(/\D/g, "").length < 9)) {
        return `Field required: ${f.label}`;
      }
      continue;
    }
    if (f.field_type === "checkbox") {
      if (v !== true && v !== "true" && v !== "yes") {
        return `Required: ${f.label}`;
      }
      continue;
    }
    if (v == null || String(v).trim() === "") {
      return `Field required: ${f.label}`;
    }
  }
  return null;
}

export async function finalizeRecipientSigning(input: {
  rawToken: string;
  values: Record<string, string | boolean>;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const tokenHash = hashSignToken(input.rawToken);
  const loaded = await loadRecipientContextByTokenHash(tokenHash);
  if (!loaded) return { ok: false, error: "Invalid or expired link.", status: 404 };
  const { recipient, packet, packetDocument, template, fields } = loaded;

  if (packet.voided_at) return { ok: false, error: "This packet was voided.", status: 410 };
  if (new Date(recipient.token_expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("signature_packets").update({ status: "expired" }).eq("id", packet.id);
    return { ok: false, error: "This link has expired.", status: 410 };
  }
  if (recipient.signed_at) return { ok: false, error: "Already signed.", status: 409 };

  await persistFieldValues({
    recipientId: recipient.id,
    packetDocumentId: packetDocument.id,
    templateFields: fields,
    values: input.values,
  });

  const { data: sensRows } = await supabaseAdmin
    .from("sensitive_document_values")
    .select("field_key")
    .eq("packet_document_id", packetDocument.id)
    .eq("recipient_id", recipient.id);
  const tinKeys = new Set((sensRows || []).map((r) => r.field_key));

  const { data: valueRows } = await supabaseAdmin
    .from("signature_field_values")
    .select("template_field_id, text_value")
    .eq("packet_document_id", packetDocument.id)
    .eq("recipient_id", recipient.id);
  const byFieldId = new Map<string, string | null>(
    (valueRows || []).map((r) => [r.template_field_id, r.text_value])
  );

  const merged: Record<string, string | boolean> = { ...input.values };
  for (const f of fields) {
    const existing = byFieldId.get(f.id);
    if (existing != null && !(f.field_key in merged)) {
      if (f.field_type === "checkbox") {
        merged[f.field_key] = existing === "true";
      } else {
        merged[f.field_key] = existing;
      }
    }
  }

  const reqErr = validateRequired(fields, merged, (k) => tinKeys.has(k));
  if (reqErr) return { ok: false, error: reqErr, status: 400 };

  const anyCertField = fields.find(
    (f) =>
      f.field_type === "checkbox" &&
      (f.field_key.toLowerCase().includes("cert") ||
        f.label.toLowerCase().includes("perjury") ||
        f.label.toLowerCase().includes("certif"))
  );
  if (template.document_type === "w9" && anyCertField) {
    const ck = merged[anyCertField.field_key];
    if (ck !== true && ck !== "true" && ck !== "yes") {
      return {
        ok: false,
        error: "You must certify under penalties of perjury before signing.",
        status: 400,
      };
    }
  }

  const { data: sensFull } = await supabaseAdmin
    .from("sensitive_document_values")
    .select("field_key, ciphertext")
    .eq("packet_document_id", packetDocument.id)
    .eq("recipient_id", recipient.id);
  const tinCipherByKey = new Map((sensFull || []).map((r) => [r.field_key, r.ciphertext]));

  const renderFields: RenderFieldInput[] = fields.map((f) => ({
    field_key: f.field_key,
    field_type: f.field_type,
    pdf_acroform_field_name: f.pdf_acroform_field_name,
    page_index: f.page_index,
    x: f.x,
    y: f.y,
    font_size: f.font_size,
    text_value:
      f.field_type === "tin"
        ? null
        : typeof merged[f.field_key] === "boolean"
          ? merged[f.field_key]
            ? "true"
            : "false"
          : String(merged[f.field_key] ?? "").trim(),
    tin_ciphertext: f.field_type === "tin" ? tinCipherByKey.get(f.field_key) ?? null : null,
  }));

  const { data: templateFile, error: dlErr } = await supabaseAdmin.storage
    .from(template.storage_bucket || PDF_SIGN_BUCKETS.templates)
    .download(template.storage_object_path);
  if (dlErr || !templateFile) {
    return { ok: false, error: "Template file not available.", status: 500 };
  }
  const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
  const { pdfBytes, sha256 } = await renderSignedPdf({
    templateBytes,
    fields: renderFields,
  });

  const isI9 = template.document_type === "i9";
  const bucket = isI9 ? PDF_SIGN_BUCKETS.i9 : PDF_SIGN_BUCKETS.completed;
  const objectPath = publicPacketDocumentPath(packet.id, packetDocument.id);

  const { error: upErr } = await supabaseAdmin.storage.from(bucket).upload(objectPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) return { ok: false, error: upErr.message, status: 500 };

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("signature_packet_documents")
    .update({
      completed_storage_bucket: bucket,
      completed_storage_path: objectPath,
      completed_sha256: sha256,
      updated_at: now,
    })
    .eq("id", packetDocument.id);

  await supabaseAdmin
    .from("signature_recipients")
    .update({ signed_at: now, last_viewed_at: now })
    .eq("id", recipient.id);

  if (isI9) {
    await supabaseAdmin
      .from("signature_packets")
      .update({ status: "signed", updated_at: now })
      .eq("id", packet.id);
    if (packet.i9_case_id) {
      await supabaseAdmin
        .from("i9_cases")
        .update({
          workflow_phase: "section2",
          updated_at: now,
        })
        .eq("id", packet.i9_case_id);
    }
  } else {
    await supabaseAdmin
      .from("signature_packets")
      .update({ status: "completed", completed_at: now, updated_at: now })
      .eq("id", packet.id);
  }

  await logSignatureEvent({
    packetId: packet.id,
    recipientId: recipient.id,
    actor: "recipient",
    action: "sign",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    templateVersion: template.version,
    documentHash: sha256,
    metadata: { bucket, objectPath },
  });

  const markIc = packet.metadata?.marks_ic_agreement === true;
  const applicantId = packet.crm_entity_type === "applicant" ? packet.crm_entity_id : null;
  if (applicantId && !isI9) {
    const docType =
      template.document_type === "w9"
        ? "saintly_pdf_w9"
        : markIc
          ? "saintly_ic_agreement"
          : "saintly_pdf_contract";
    const label =
      template.document_type === "w9"
        ? "Signed W-9 (Saintly PDF Sign)"
        : markIc
          ? "Signed independent contractor agreement (Saintly PDF Sign)"
          : "Signed agreement (Saintly PDF Sign)";
    try {
      await attachCompletedPdfToApplicant({
        applicantId,
        packetId: packet.id,
        pdfBytes,
        documentType: docType,
        documentLabel: label,
      });
    } catch (e) {
      console.error("[finalizeRecipientSigning] attach applicant file", e);
    }
  }

  if (markIc && applicantId) {
    await insertAuditLogTrusted({
      action: "pdf_sign_ic_agreement_completed",
      entityType: "signature_packet",
      entityId: packet.id,
      metadata: { applicant_id: applicantId },
    });
  }

  await insertAuditLogTrusted({
    action: "pdf_sign_completed",
    entityType: "signature_packet",
    entityId: packet.id,
    metadata: {
      document_type: template.document_type,
      crm_entity_type: packet.crm_entity_type,
      crm_entity_id: packet.crm_entity_id,
      sha256,
    },
  });

  return { ok: true };
}

export async function markRecipientViewed(tokenHash: string): Promise<void> {
  const loaded = await loadRecipientContextByTokenHash(tokenHash);
  if (!loaded) return;
  const { recipient, packet, template } = loaded;
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("signature_recipients")
    .update({ last_viewed_at: now })
    .eq("id", recipient.id);
  if (packet.status === "sent" || packet.status === "draft") {
    await supabaseAdmin.from("signature_packets").update({ status: "viewed", updated_at: now }).eq("id", packet.id);
  }
  await logSignatureEvent({
    packetId: packet.id,
    recipientId: recipient.id,
    actor: "recipient",
    action: "view",
    templateVersion: template.version,
    metadata: {},
  });
}
