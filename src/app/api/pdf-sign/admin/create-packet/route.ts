import { NextResponse } from "next/server";

import { PDF_SIGN_MANUAL_SEND_CRM_ENTITY_ID } from "@/lib/pdf-sign/crm-link-display";
import {
  pdfSignDefaultFromEmail,
  sanitizePdfSignSelectedFromEmail,
} from "@/lib/pdf-sign/pdf-sign-from-email";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { sendPdfSignLinkEmail } from "@/lib/email/send-pdf-sign-email";
import { buildPdfSignRecipientUrl } from "@/lib/pdf-sign/app-url";
import { createRawSignToken, hashSignToken } from "@/lib/pdf-sign/token";
import { senderAssignableTemplateFields, validateSenderPrefillAgainstTemplate } from "@/lib/pdf-sign/validate-sender-prefill";
import { uploadPdfSignSenderSignaturePng } from "@/lib/pdf-sign/upload-sender-signature-png";
import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

type RecipientInput = {
  email?: string;
  name?: string;
  phone?: string;
};

type Body = {
  templateId?: string;
  crmEntityType?: string;
  crmEntityId?: string;
  /** Primary + optional additional contacts (only the first receives the signing link today). */
  recipients?: RecipientInput[];
  recipientEmail?: string;
  recipientName?: string;
  recipientPhone?: string;
  ttlDays?: number;
  sendEmail?: boolean;
  marksIcAgreement?: boolean;
  i9ReviewMethod?: string | null;
  message?: string;
  smsRequested?: boolean;
  /** @deprecated Legacy blob; prefer senderValues + senderSignatureImages. */
  senderState?: Record<string, unknown> | null;
  senderValues?: Record<string, string | boolean>;
  senderSignatureImages?: Record<string, string>;
  /** Allow-listed “Send from” / Reply-To for the signing invitation email. */
  notifyFromEmail?: string | null;
};

function normalizeRecipientRows(body: Body): RecipientInput[] {
  if (Array.isArray(body.recipients) && body.recipients.length > 0) {
    return body.recipients;
  }
  if (body.recipientEmail?.trim()) {
    return [
      {
        email: body.recipientEmail,
        name: body.recipientName,
        phone: body.recipientPhone,
      },
    ];
  }
  return [];
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const templateId = body.templateId?.trim();
  const crmEntityTypeInput = body.crmEntityType?.trim() || "";
  const crmEntityIdInput = body.crmEntityId?.trim() || "";
  const recipientRowsRaw = normalizeRecipientRows(body);

  const ttlDays =
    typeof body.ttlDays === "number" && body.ttlDays > 0 ? Math.min(body.ttlDays, 90) : 14;
  const sendEmail = body.sendEmail === true;
  const marksIcAgreement = body.marksIcAgreement === true;

  const senderValuesIn = {
    ...(typeof body.senderState === "object" &&
    body.senderState &&
    "values" in body.senderState &&
    body.senderState.values &&
    typeof body.senderState.values === "object" &&
    !Array.isArray(body.senderState.values)
      ? (body.senderState.values as Record<string, string | boolean>)
      : {}),
    ...(body.senderValues ?? {}),
  } as Record<string, string | boolean>;
  const senderImagesIn = (body.senderSignatureImages || {}) as Record<string, string>;

  if (!templateId || recipientRowsRaw.length === 0 || !recipientRowsRaw[0]?.email?.trim()) {
    return NextResponse.json({ error: "Missing template or primary recipient email." }, { status: 400 });
  }

  const recipientRows = recipientRowsRaw
    .map((r) => ({
      email: r.email?.trim().toLowerCase() || "",
      name: r.name?.trim() || "",
      phone: r.phone?.trim() || "",
    }))
    .filter((r) => r.email.includes("@"));

  if (recipientRows.length === 0) {
    return NextResponse.json({ error: "At least one valid recipient email is required." }, { status: 400 });
  }

  const primary = recipientRows[0];
  const extras = recipientRows.slice(1);

  const recipientEmail = primary.email;
  const recipientName = primary.name || null;
  const primaryPhone = primary.phone?.trim() || null;

  const { data: template, error: tErr } = await supabaseAdmin
    .from("signature_templates")
    .select("id, document_type, name, version, is_active, storage_bucket, storage_object_path")
    .eq("id", templateId)
    .maybeSingle();
  if (tErr || !template?.is_active) {
    return NextResponse.json({ error: "Template not found or inactive." }, { status: 404 });
  }

  if (template.document_type === "i9") {
    if (!isAdminOrHigher(staff)) {
      return NextResponse.json({ error: "Only admins can create I-9 packets." }, { status: 403 });
    }
    if (crmEntityTypeInput !== "applicant" || !crmEntityIdInput) {
      return NextResponse.json(
        { error: "I-9 packets must be linked to an applicant record." },
        { status: 400 }
      );
    }
  }

  let crmEntityType: string;
  let crmEntityId: string;

  if (crmEntityIdInput) {
    if (!["applicant", "lead", "contact", "vendor"].includes(crmEntityTypeInput)) {
      return NextResponse.json({ error: "Invalid CRM record type." }, { status: 400 });
    }
    crmEntityType = crmEntityTypeInput;
    crmEntityId = crmEntityIdInput;
  } else {
    crmEntityType = "vendor";
    crmEntityId = PDF_SIGN_MANUAL_SEND_CRM_ENTITY_ID;
  }

  const i9ReviewMethod = body.i9ReviewMethod?.trim() || null;
  if (template.document_type === "i9") {
    if (
      i9ReviewMethod &&
      i9ReviewMethod !== "in_person_physical_review" &&
      i9ReviewMethod !== "remote_alternative_procedure_everify"
    ) {
      return NextResponse.json({ error: "Invalid I-9 review method." }, { status: 400 });
    }
  }

  const { data: templateFieldsRows } = await supabaseAdmin
    .from("signature_template_fields")
    .select("field_key, label, field_type, signer_role, required, options")
    .eq("template_id", template.id);
  const allFields = templateFieldsRows || [];
  if (allFields.length === 0) {
    return NextResponse.json(
      { error: "This template has no saved fields yet. Edit fields before sending." },
      { status: 400 }
    );
  }
  const templateFieldModels = allFields.map((f) => ({
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    signer_role: f.signer_role,
    options: f.options,
    required: f.required,
  }));
  const prefillErr = validateSenderPrefillAgainstTemplate({
    templateFields: templateFieldModels,
    senderValues: senderValuesIn,
    senderSignatureImages: senderImagesIn,
  });
  if (prefillErr) {
    return NextResponse.json({ error: prefillErr }, { status: 400 });
  }
  const senderAssignable = senderAssignableTemplateFields(templateFieldModels);

  let i9CaseId: string | null = null;
  if (template.document_type === "i9") {
    const { data: i9Row, error: i9Err } = await supabaseAdmin
      .from("i9_cases")
      .insert({
        applicant_id: crmEntityId,
        review_method: i9ReviewMethod,
        workflow_phase: "section1",
      })
      .select("id")
      .single();
    if (i9Err || !i9Row?.id) {
      return NextResponse.json({ error: i9Err?.message || "Could not create I-9 case." }, { status: 500 });
    }
    i9CaseId = i9Row.id;
  }

  const expiresAt = new Date(Date.now() + ttlDays * 86400000).toISOString();
  const pdfSignStoredFromEmail =
    sanitizePdfSignSelectedFromEmail(body.notifyFromEmail) ?? pdfSignDefaultFromEmail();

  const metadata: Record<string, unknown> = {
    pdf_sign_from_email: pdfSignStoredFromEmail,
  };
  if (marksIcAgreement) metadata.marks_ic_agreement = true;
  const msg = typeof body.message === "string" ? body.message.trim() : "";
  if (msg) metadata.message = msg;
  if (body.smsRequested === true) metadata.sms_requested = true;
  if (primaryPhone) metadata.recipient_phone = primaryPhone;
  if (extras.length > 0) {
    metadata.pdf_sign_additional_recipients = extras.map((r) => ({
      display_name: r.name || null,
      email: r.email,
      phone: r.phone || null,
    }));
  }

  const { data: packet, error: pErr } = await supabaseAdmin
    .from("signature_packets")
    .insert({
      status: "draft",
      primary_document_type: template.document_type,
      crm_entity_type: crmEntityType,
      crm_entity_id: crmEntityId,
      i9_case_id: i9CaseId,
      i9_section: template.document_type === "i9" ? "section1" : null,
      metadata,
      created_by_staff_user_id: user.id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (pErr || !packet?.id) {
    if (i9CaseId) await supabaseAdmin.from("i9_cases").delete().eq("id", i9CaseId);
    return NextResponse.json({ error: pErr?.message || "Could not create packet." }, { status: 500 });
  }

  const { error: docErr } = await supabaseAdmin.from("signature_packet_documents").insert({
    packet_id: packet.id,
    template_id: template.id,
    template_version_snapshot: template.version,
    sort_order: 0,
  });
  if (docErr) {
    await supabaseAdmin.from("signature_packets").delete().eq("id", packet.id);
    if (i9CaseId) await supabaseAdmin.from("i9_cases").delete().eq("id", i9CaseId);
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  if (i9CaseId) {
    const { error: linkErr } = await supabaseAdmin
      .from("i9_cases")
      .update({ section1_packet_id: packet.id })
      .eq("id", i9CaseId);
    if (linkErr) {
      await supabaseAdmin.from("signature_packets").delete().eq("id", packet.id);
      await supabaseAdmin.from("i9_cases").delete().eq("id", i9CaseId);
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }
  }

  if (senderAssignable.length > 0) {
    const senderByKey = new Map(senderAssignable.map((f) => [f.field_key, f]));
    const senderSignaturePaths: Record<string, { bucket: string; path: string }> = {};
    const sanitisedValues: Record<string, string | boolean> = {};
    for (const [key, raw] of Object.entries(senderValuesIn)) {
      if (!senderByKey.has(key)) continue;
      sanitisedValues[key] = raw;
    }
    for (const [key, dataUrl] of Object.entries(senderImagesIn)) {
      const meta = senderByKey.get(key);
      if (!meta) continue;
      if (meta.field_type !== "signature" && meta.field_type !== "initials") continue;
      const uploaded = await uploadPdfSignSenderSignaturePng({
        packetId: packet.id,
        fieldKey: key,
        dataUrl,
      });
      if (uploaded) senderSignaturePaths[key] = uploaded;
    }
    await supabaseAdmin
      .from("signature_packets")
      .update({
        sender_state: {
          values: sanitisedValues,
          signaturePaths: senderSignaturePaths,
          completedAt: new Date().toISOString(),
          completedByStaffUserId: user.id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", packet.id);
  }

  const rawToken = createRawSignToken();
  const tokenHash = hashSignToken(rawToken);

  const { error: recErr } = await supabaseAdmin.from("signature_recipients").insert({
    packet_id: packet.id,
    email: recipientEmail,
    display_name: recipientName,
    phone: primaryPhone,
    token_hash: tokenHash,
    token_expires_at: expiresAt,
  });
  if (recErr) {
    await supabaseAdmin.from("signature_packets").delete().eq("id", packet.id);
    if (i9CaseId) await supabaseAdmin.from("i9_cases").delete().eq("id", i9CaseId);
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }

  const { error: upErr } = await supabaseAdmin
    .from("signature_packets")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", packet.id);
  if (upErr) {
    await supabaseAdmin.from("signature_recipients").delete().eq("packet_id", packet.id);
    await supabaseAdmin.from("signature_packets").delete().eq("id", packet.id);
    if (i9CaseId) await supabaseAdmin.from("i9_cases").delete().eq("id", i9CaseId);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const signUrl = buildPdfSignRecipientUrl(rawToken);
  let emailResult: { ok: true } | { ok: false; error: string } | null = null;
  if (sendEmail) {
    emailResult = await sendPdfSignLinkEmail({
      to: recipientEmail,
      recipientName,
      link: signUrl,
      documentLabel: template.name,
      pdfSignReplyToEmail: pdfSignStoredFromEmail,
    });
  }

  await insertAuditLogTrusted({
    action: "pdf_sign_packet_created",
    entityType: "signature_packet",
    entityId: packet.id,
    metadata: {
      template_id: template.id,
      document_type: template.document_type,
      crm_entity_type: crmEntityType,
      crm_entity_id: crmEntityId,
      send_email: sendEmail,
      additional_recipient_count: extras.length,
    },
  });

  return NextResponse.json({
    ok: true,
    packetId: packet.id,
    signUrl,
    emailSent: sendEmail && emailResult?.ok === true,
    emailError: sendEmail && emailResult && !emailResult.ok ? emailResult.error : null,
  });
}
