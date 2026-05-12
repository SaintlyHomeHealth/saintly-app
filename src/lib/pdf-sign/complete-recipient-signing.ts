import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { PDF_SIGN_BUCKETS } from "@/lib/pdf-sign/constants";
import { encryptSensitiveField } from "@/lib/pdf-sign/field-crypto";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import {
  signerPartyFromField,
} from "@/lib/pdf-sign/normalize";
import { renderSignedPdf, type RenderFieldInput } from "@/lib/pdf-sign/render-pdf";
import { parsePdfSignSenderState } from "@/lib/pdf-sign/sender-state";
import { decodeSignPngDataUrl, uploadPdfSignRecipientSignaturePng } from "@/lib/pdf-sign/upload-sender-signature-png";
import { hashSignToken } from "@/lib/pdf-sign/token";

function isOptionalField(options: unknown): boolean {
  if (!options || typeof options !== "object") return false;
  return (options as { optional?: boolean }).optional === true;
}

function fieldSkipsRequirement(f: {
  required?: boolean | null;
  options: unknown;
}): boolean {
  if (f.required === false) return true;
  return isOptionalField(f.options);
}

function publicPacketDocumentPath(packetId: string, docId: string) {
  return `packets/${packetId}/doc-${docId}.pdf`;
}

async function fetchStorageObjectBytes(bucket: string, path: string): Promise<Uint8Array | null> {
  const { data: file, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !file) return null;
  return new Uint8Array(await file.arrayBuffer());
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

  const recipientPartyFields = fields.filter((f) => signerPartyFromField(f) === "recipient");

  const draftValues = { ...input.values };
  for (const f of recipientPartyFields) {
    if (f.field_type === "signature" || f.field_type === "initials") {
      delete draftValues[f.field_key];
    }
  }

  await persistFieldValues({
    recipientId: recipient.id,
    packetDocumentId: packetDocument.id,
    templateFields: recipientPartyFields,
    values: draftValues,
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

export type RecipientTemplateFieldRow = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  signer_role?: string | null;
  pdf_acroform_field_name: string | null;
  page_index: number;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  font_size: number;
  required: boolean | null;
  options: unknown;
  required_order: number;
};

export type RecipientSigningLoadedContext = {
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
    sender_state: unknown;
  };
  packetDocument: {
    id: string;
    template_id: string;
    template_version_snapshot: number;
    completed_storage_bucket: string | null;
    completed_storage_path: string | null;
  };
  template: {
    id: string;
    document_type: string;
    name?: string | null;
    storage_bucket: string;
    storage_object_path: string;
    version: number;
  };
  fields: RecipientTemplateFieldRow[];
};

export async function loadRecipientContextByTokenHash(
  tokenHash: string
): Promise<RecipientSigningLoadedContext | null> {
  const { data: recipient, error: rErr } = await supabaseAdmin
    .from("signature_recipients")
    .select("id, email, display_name, token_expires_at, signed_at, packet_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (rErr || !recipient) return null;

  const { data: packet, error: pErr } = await supabaseAdmin
    .from("signature_packets")
    .select(
      "id, status, primary_document_type, voided_at, crm_entity_type, crm_entity_id, metadata, i9_case_id, i9_section, sender_state"
    )
    .eq("id", recipient.packet_id)
    .maybeSingle();
  if (pErr || !packet) return null;

  const { data: packetDocument, error: dErr } = await supabaseAdmin
    .from("signature_packet_documents")
    .select("id, template_id, template_version_snapshot, completed_storage_bucket, completed_storage_path")
    .eq("packet_id", packet.id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (dErr || !packetDocument) return null;

  const { data: template, error: tErr } = await supabaseAdmin
    .from("signature_templates")
    .select("id, document_type, name, storage_bucket, storage_object_path, version")
    .eq("id", packetDocument.template_id)
    .maybeSingle();
  if (tErr || !template) return null;

  const { data: fields, error: fErr } = await supabaseAdmin
    .from("signature_template_fields")
    .select(
      "id, field_key, label, field_type, signer_role, pdf_acroform_field_name, page_index, x, y, width, height, font_size, options, required_order, required"
    )
    .eq("template_id", template.id)
    .order("required_order", { ascending: true });
  if (fErr || !fields?.length) return null;

  return {
    recipient,
    packet: {
      ...packet,
      metadata: (packet.metadata as Record<string, unknown>) || {},
      sender_state: packet.sender_state,
    },
    packetDocument,
    template,
    fields,
  };
}

async function persistFieldValues(input: {
  recipientId: string;
  packetDocumentId: string;
  templateFields: RecipientTemplateFieldRow[];
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

function recipientSigPngDecodedKeys(input: {
  recipientPartyFields: RecipientTemplateFieldRow[];
  recipientSignatureImages?: Record<string, string> | null;
}): Set<string> {
  const set = new Set<string>();
  const imgs = input.recipientSignatureImages;
  if (!imgs) return set;
  for (const f of input.recipientPartyFields) {
    if (f.field_type !== "signature" && f.field_type !== "initials") continue;
    const raw = imgs[f.field_key];
    if (typeof raw !== "string" || !decodeSignPngDataUrl(raw)) continue;
    set.add(f.field_key);
  }
  return set;
}

function validateRequired(
  fields: RecipientTemplateFieldRow[],
  values: Record<string, string | boolean>,
  hasTin: (key: string) => boolean,
  recipientSigPngKeys: ReadonlySet<string>
): string | null {
  for (const f of fields) {
    if (fieldSkipsRequirement(f)) continue;
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
    if (f.field_type === "signature" || f.field_type === "initials") {
      if (!fieldSkipsRequirement(f)) {
        const pngOk = recipientSigPngKeys.has(f.field_key);
        const txt = String(v ?? "").trim();
        if (!pngOk && txt === "") return `Field required: ${f.label}`;
      }
      continue;
    }
    if (v == null || String(v).trim() === "") {
      return `Field required: ${f.label}`;
    }
  }
  return null;
}

function pdfSignMergedRenderInputs(input: {
  fields: RecipientTemplateFieldRow[];
  mergedRecipient: Record<string, string | boolean>;
  tinCipherByKey: Map<string, string>;
  senderVals: Record<string, string | boolean>;
  senderPngByKey: Map<string, Uint8Array>;
  recipientPngByKey: Map<string, Uint8Array>;
}): RenderFieldInput[] {
  const { fields, mergedRecipient, tinCipherByKey, senderVals, senderPngByKey, recipientPngByKey } =
    input;

  function renderMergeText(f: RecipientTemplateFieldRow, party: "recipient" | "sender"): string | null {
    if (
      party === "recipient" &&
      (f.field_type === "signature" || f.field_type === "initials") &&
      recipientPngByKey.has(f.field_key)
    ) {
      return null;
    }
    if (
      party === "sender" &&
      (f.field_type === "signature" || f.field_type === "initials") &&
      senderPngByKey.has(f.field_key)
    ) {
      return null;
    }
    if (f.field_type === "tin") {
      if (party === "recipient") {
        return null;
      }
      return String(senderVals[f.field_key] ?? "").trim() || null;
    }
    if (f.field_type === "checkbox") {
      const raw = party === "recipient" ? mergedRecipient[f.field_key] : senderVals[f.field_key];
      const b = raw === true || raw === "true" || raw === "yes";
      return b ? "true" : "false";
    }
    const s =
      party === "recipient"
        ? String(mergedRecipient[f.field_key] ?? "").trim()
        : String(senderVals[f.field_key] ?? "").trim();
    return s || null;
  }

  return fields.map((f) => {
    const party = signerPartyFromField(f);
    const sigSenderPng =
      party === "sender" &&
      (f.field_type === "signature" || f.field_type === "initials") &&
      senderPngByKey.get(f.field_key)
        ? senderPngByKey.get(f.field_key) ?? null
        : null;
    const sigRecipientPng =
      party === "recipient" &&
      (f.field_type === "signature" || f.field_type === "initials") &&
      recipientPngByKey.get(f.field_key)
        ? recipientPngByKey.get(f.field_key) ?? null
        : null;
    const sigPng = sigSenderPng || sigRecipientPng;

    const textVal = renderMergeText(f, party);

    return {
      field_key: f.field_key,
      field_type: f.field_type,
      pdf_acroform_field_name: f.pdf_acroform_field_name,
      page_index: f.page_index,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      font_size: f.font_size,
      text_value: f.field_type === "tin" && party === "recipient" ? null : textVal,
      tin_ciphertext:
        f.field_type === "tin" && party === "recipient"
          ? tinCipherByKey.get(f.field_key) ?? null
          : null,
      signature_png_bytes: sigPng,
    };
  });
}

export async function finalizeRecipientSigning(input: {
  rawToken: string;
  values: Record<string, string | boolean>;
  recipientSignatureImages?: Record<string, string>;
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

  const recipientPartyFields = fields.filter((f) => signerPartyFromField(f) === "recipient");

  const { data: sensRowsDraft } = await supabaseAdmin
    .from("sensitive_document_values")
    .select("field_key")
    .eq("packet_document_id", packetDocument.id)
    .eq("recipient_id", recipient.id);
  const tinKeysDraft = new Set((sensRowsDraft || []).map((r) => r.field_key));

  const { data: valueRowsDraft } = await supabaseAdmin
    .from("signature_field_values")
    .select("template_field_id, text_value")
    .eq("packet_document_id", packetDocument.id)
    .eq("recipient_id", recipient.id);
  const byFieldIdDraft = new Map<string, string | null>(
    (valueRowsDraft || []).map((r) => [r.template_field_id, r.text_value])
  );

  let mergedSubmission: Record<string, string | boolean> = { ...input.values };
  for (const f of recipientPartyFields) {
    const existing = byFieldIdDraft.get(f.id);
    if (existing != null && !(f.field_key in mergedSubmission)) {
      if (f.field_type === "checkbox") {
        mergedSubmission[f.field_key] = existing === "true";
      } else {
        mergedSubmission[f.field_key] = existing;
      }
    }
  }

  const sigPngDecodedKeys = recipientSigPngDecodedKeys({
    recipientPartyFields,
    recipientSignatureImages: input.recipientSignatureImages,
  });

  const reqErr = validateRequired(recipientPartyFields, mergedSubmission, (k) => tinKeysDraft.has(k), sigPngDecodedKeys);
  if (reqErr) return { ok: false, error: reqErr, status: 400 };

  const anyCertField = recipientPartyFields.find(
    (f) =>
      f.field_type === "checkbox" &&
      (f.field_key.toLowerCase().includes("cert") ||
        f.label.toLowerCase().includes("perjury") ||
        f.label.toLowerCase().includes("certif"))
  );
  if (template.document_type === "w9" && anyCertField) {
    const ck = mergedSubmission[anyCertField.field_key];
    if (ck !== true && ck !== "true" && ck !== "yes") {
      return {
        ok: false,
        error: "You must certify under penalties of perjury before signing.",
        status: 400,
      };
    }
  }

  const recipientPngByKey = new Map<string, Uint8Array>();
  const imgsIn = input.recipientSignatureImages || {};
  for (const f of recipientPartyFields) {
    if (f.field_type !== "signature" && f.field_type !== "initials") continue;
    const du = imgsIn[f.field_key];
    if (!du?.trim()) continue;
    const bytes = decodeSignPngDataUrl(du);
    if (!bytes) continue;
    const uploaded = await uploadPdfSignRecipientSignaturePng({
      packetId: packet.id,
      recipientId: recipient.id,
      fieldKey: f.field_key,
      dataUrl: du,
    });
    if (!uploaded) {
      return {
        ok: false,
        error: "Could not save your signature. Please try again.",
        status: 500,
      };
    }
    recipientPngByKey.set(f.field_key, bytes);
  }

  const persistVals: Record<string, string | boolean> = { ...input.values };
  for (const f of recipientPartyFields) {
    if (f.field_type === "signature" || f.field_type === "initials") {
      const v = persistVals[f.field_key];
      if (typeof v === "string" && /^data:image\/png;base64,/i.test(v.trim())) persistVals[f.field_key] = "";
    }
  }

  await persistFieldValues({
    recipientId: recipient.id,
    packetDocumentId: packetDocument.id,
    templateFields: recipientPartyFields,
    values: persistVals,
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

  let merged: Record<string, string | boolean> = { ...persistVals };
  for (const f of recipientPartyFields) {
    const existing = byFieldId.get(f.id);
    if (existing != null && !(f.field_key in merged)) {
      if (f.field_type === "checkbox") {
        merged[f.field_key] = existing === "true";
      } else {
        merged[f.field_key] = existing;
      }
    }
  }

  const postPersistErr = validateRequired(recipientPartyFields, merged, (k) => tinKeys.has(k), sigPngDecodedKeys);
  if (postPersistErr) return { ok: false, error: postPersistErr, status: 400 };

  const { data: sensFull } = await supabaseAdmin
    .from("sensitive_document_values")
    .select("field_key, ciphertext")
    .eq("packet_document_id", packetDocument.id)
    .eq("recipient_id", recipient.id);
  const tinCipherByKey = new Map((sensFull || []).map((r) => [r.field_key, r.ciphertext]));

  const senderParsedNull = parsePdfSignSenderState(packet.sender_state);
  const senderVals = senderParsedNull?.values ?? {};

  const signaturePaths = senderParsedNull?.signaturePaths ?? {};
  const senderPngByKey = new Map<string, Uint8Array>();
  await Promise.all(
    Object.entries(signaturePaths).map(async ([fk, meta]) => {
      const loadedPng = await fetchStorageObjectBytes(meta.bucket, meta.path);
      if (loadedPng && loadedPng.length > 0) senderPngByKey.set(fk, loadedPng);
    })
  );

  const renderFields = pdfSignMergedRenderInputs({
    fields,
    mergedRecipient: merged,
    tinCipherByKey,
    senderVals,
    senderPngByKey,
    recipientPngByKey,
  });

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

export async function renderRecipientSigningPreviewPdf(
  loaded: RecipientSigningLoadedContext
): Promise<{ pdfBytes: Uint8Array } | { error: string; status: number }> {
  const { packet, packetDocument, template, fields } = loaded;
  const recipientId = loaded.recipient.id;

  const recipientPartyFields = fields.filter((f) => signerPartyFromField(f) === "recipient");

  const { data: sensFull } = await supabaseAdmin
    .from("sensitive_document_values")
    .select("field_key, ciphertext")
    .eq("packet_document_id", packetDocument.id)
    .eq("recipient_id", recipientId);
  const tinCipherByKey = new Map((sensFull || []).map((r) => [r.field_key, r.ciphertext]));

  const { data: valueRows } = await supabaseAdmin
    .from("signature_field_values")
    .select("template_field_id, text_value, bool_value")
    .eq("packet_document_id", packetDocument.id)
    .eq("recipient_id", recipientId);
  const valueByFieldId = new Map((valueRows || []).map((r) => [r.template_field_id, r]));

  const mergedRecipient: Record<string, string | boolean> = {};
  for (const f of recipientPartyFields) {
    const stored = valueByFieldId.get(f.id);
    if (!stored) continue;
    if (f.field_type === "checkbox") {
      mergedRecipient[f.field_key] =
        Boolean(stored.bool_value === true || stored.text_value === "true");
      continue;
    }
    if (
      f.field_type === "tin" ||
      f.field_type === "signature" ||
      f.field_type === "initials"
    ) {
      continue;
    }
    mergedRecipient[f.field_key] = (stored.text_value ?? "").trim();
  }

  const senderParsedNull = parsePdfSignSenderState(packet.sender_state);
  const senderVals = senderParsedNull?.values ?? {};

  const signaturePaths = senderParsedNull?.signaturePaths ?? {};
  const senderPngByKey = new Map<string, Uint8Array>();
  await Promise.all(
    Object.entries(signaturePaths).map(async ([fk, meta]) => {
      const loadedPng = await fetchStorageObjectBytes(meta.bucket, meta.path);
      if (loadedPng && loadedPng.length > 0) senderPngByKey.set(fk, loadedPng);
    })
  );

  const recipientPngByKey = new Map<string, Uint8Array>();

  const renderFields = pdfSignMergedRenderInputs({
    fields,
    mergedRecipient,
    tinCipherByKey,
    senderVals,
    senderPngByKey,
    recipientPngByKey,
  });

  const { data: templateFile, error: dlErr } = await supabaseAdmin.storage
    .from(template.storage_bucket || PDF_SIGN_BUCKETS.templates)
    .download(template.storage_object_path);
  if (dlErr || !templateFile) {
    return { error: "Document file unavailable.", status: 500 };
  }

  const templateBytes = new Uint8Array(await templateFile.arrayBuffer());
  const { pdfBytes } = await renderSignedPdf({ templateBytes, fields: renderFields });
  return { pdfBytes };
}

export async function fetchRecipientCompletedPdfBytes(
  loaded: RecipientSigningLoadedContext
): Promise<{ pdfBytes: Uint8Array } | { error: string; status: number }> {
  if (!loaded.recipient.signed_at) {
    return { error: "Document has not been signed yet.", status: 409 };
  }
  const b = loaded.packetDocument.completed_storage_bucket?.trim();
  const p = loaded.packetDocument.completed_storage_path?.trim();
  if (!b || !p) return { error: "Signed PDF is not available yet.", status: 404 };

  const bytes = await fetchStorageObjectBytes(b, p);
  if (!bytes?.length) return { error: "Signed PDF is not available yet.", status: 404 };

  return { pdfBytes: bytes };
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
