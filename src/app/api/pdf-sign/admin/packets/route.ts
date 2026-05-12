import { NextResponse } from "next/server";

import { insertAuditLogTrusted } from "@/lib/audit-log";
import { sendPdfSignLinkEmail } from "@/lib/email/send-pdf-sign-email";
import { buildPdfSignRecipientUrl } from "@/lib/pdf-sign/app-url";
import { senderAssignableTemplateFields, validateSenderPrefillAgainstTemplate } from "@/lib/pdf-sign/validate-sender-prefill";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import { sendSignLinkSms } from "@/lib/pdf-sign/send-sign-sms";
import { uploadPdfSignSenderSignaturePng } from "@/lib/pdf-sign/upload-sender-signature-png";
import { createRawSignToken, hashSignToken } from "@/lib/pdf-sign/token";
import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

const RECIPIENT_TYPES = new Set([
  "employee",
  "recruit",
  "lead",
  "facility_contact",
  "manual",
]);

type SendPacketBody = {
  templateId?: string;
  title?: string;
  message?: string;
  ttlDays?: number;
  recipient?: {
    type?: string;
    recordId?: string | null;
    name?: string;
    email?: string;
    phone?: string | null;
  };
  delivery?: {
    email?: boolean;
    sms?: boolean;
  };
  /**
   * Saintly Sign · Step 3 prefill values produced by the admin before
   * sending. Keys are field_key strings; values are plain text/booleans for
   * non-signature fields. Only sender/internal-assigned fields are honored.
   */
  senderValues?: Record<string, string | boolean>;
  /**
   * Map of field_key -> data:image/png;base64,... captured from the signature
   * pad in the Saintly fields step. Each entry produces an upload to the
   * signature-images bucket.
   */
  senderSignatureImages?: Record<string, string>;
};

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 200);

  let q = supabaseAdmin
    .from("signature_packets")
    .select(
      "id, status, primary_document_type, title, recipient_type, recipient_record_id, recipient_name, recipient_email, recipient_phone, sms_requested, sms_sent_at, sms_error, expires_at, sent_at, viewed_at, completed_at, voided_at, created_at, updated_at, completed_pdf_storage_path, completed_pdf_storage_bucket, signature_packet_documents(id, completed_storage_bucket, completed_storage_path)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    if (status === "awaiting_signature") {
      q = q.in("status", ["sent", "viewed", "in_progress"]);
    } else if (status === "active") {
      q = q.in("status", ["draft", "sent", "viewed", "in_progress"]);
    } else if (status === "expired_or_voided") {
      q = q.in("status", ["expired", "voided"]);
    } else {
      q = q.eq("status", status);
    }
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ packets: data || [] });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: SendPacketBody;
  try {
    body = (await request.json()) as SendPacketBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const templateId = body.templateId?.trim();
  const recipientType = body.recipient?.type?.trim() || "manual";
  const recipientRecordId = body.recipient?.recordId?.trim() || null;
  const recipientName = body.recipient?.name?.trim() || null;
  const recipientEmail = body.recipient?.email?.trim().toLowerCase() || "";
  const recipientPhoneRaw = body.recipient?.phone?.trim() || null;
  const ttlDays =
    typeof body.ttlDays === "number" && body.ttlDays > 0 ? Math.min(body.ttlDays, 90) : 14;
  const wantsEmail = body.delivery?.email !== false;
  const wantsSms = body.delivery?.sms === true;
  const message = body.message?.trim() || null;

  const senderValuesIn = (body.senderValues || {}) as Record<string, string | boolean>;
  const senderImagesIn = (body.senderSignatureImages || {}) as Record<string, string>;

  if (!templateId) return NextResponse.json({ error: "Missing templateId." }, { status: 400 });
  if (!RECIPIENT_TYPES.has(recipientType)) {
    return NextResponse.json({ error: "Invalid recipient type." }, { status: 400 });
  }
  if (!recipientEmail.includes("@")) {
    return NextResponse.json({ error: "Recipient email is required." }, { status: 400 });
  }
  if (wantsSms && !recipientPhoneRaw) {
    return NextResponse.json(
      { error: "Phone number is required when SMS delivery is enabled." },
      { status: 400 }
    );
  }

  const { data: template, error: tErr } = await supabaseAdmin
    .from("signature_templates")
    .select("id, document_type, name, version, is_active, storage_bucket, storage_object_path")
    .eq("id", templateId)
    .maybeSingle();
  if (tErr || !template?.is_active) {
    return NextResponse.json({ error: "Template not found or archived." }, { status: 404 });
  }

  if (template.document_type === "i9" && !isAdminOrHigher(staff)) {
    return NextResponse.json({ error: "Only admins can send I-9 packets." }, { status: 403 });
  }

  // Load template fields so we can validate that any senderValues provided
  // actually belong to sender/internal-assigned fields and surface a clean
  // "no fields mapped" error early.
  const { data: templateFields } = await supabaseAdmin
    .from("signature_template_fields")
    .select("field_key, label, field_type, signer_role, required, options")
    .eq("template_id", template.id);
  const allFields = templateFields || [];
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

  // Map recipient_type -> existing crm_entity_type for compatibility with the
  // legacy column (still NOT NULL on signature_packets).
  const crmEntityType =
    recipientType === "employee"
      ? "applicant"
      : recipientType === "recruit"
        ? "applicant"
        : recipientType === "lead"
          ? "lead"
          : recipientType === "facility_contact"
            ? "contact"
            : "vendor"; // manual fallback
  if (recipientType !== "manual" && !recipientRecordId) {
    return NextResponse.json(
      { error: `recordId is required for recipient type ${recipientType}.` },
      { status: 400 }
    );
  }
  // For manual recipients we still need a non-null crm_entity_id (UUID) for the
  // existing schema. We synthesise a stable null UUID and rely on
  // recipient_record_id / recipient_type for the real linkage.
  const fallbackCrmId = "00000000-0000-0000-0000-000000000000";
  const crmEntityId = recipientRecordId || fallbackCrmId;

  const expiresAt = new Date(Date.now() + ttlDays * 86400000).toISOString();
  const title = (body.title?.trim() || template.name).slice(0, 200);

  const { data: packet, error: pErr } = await supabaseAdmin
    .from("signature_packets")
    .insert({
      status: "draft",
      primary_document_type: template.document_type,
      crm_entity_type: crmEntityType,
      crm_entity_id: crmEntityId,
      title,
      recipient_type: recipientType,
      recipient_record_id: recipientRecordId,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      recipient_phone: recipientPhoneRaw,
      message,
      sms_requested: wantsSms,
      created_by_staff_user_id: user.id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (pErr || !packet?.id) {
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
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  // Upload any sender-side drawn signatures and persist sender_state on the
  // packet so it can be flattened into the final PDF when the recipient signs.
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
    phone: recipientPhoneRaw,
    token_hash: tokenHash,
    token_expires_at: expiresAt,
  });
  if (recErr) {
    await supabaseAdmin.from("signature_packets").delete().eq("id", packet.id);
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }

  const sentAt = new Date().toISOString();
  await supabaseAdmin
    .from("signature_packets")
    .update({ status: "sent", sent_at: sentAt, updated_at: sentAt })
    .eq("id", packet.id);

  const signUrl = buildPdfSignRecipientUrl(rawToken);

  let emailSent = false;
  let emailError: string | null = null;
  if (wantsEmail) {
    const r = await sendPdfSignLinkEmail({
      to: recipientEmail,
      recipientName,
      link: signUrl,
      documentLabel: title,
    });
    if (r.ok) emailSent = true;
    else emailError = r.error;
    await logSignatureEvent({
      packetId: packet.id,
      actor: "system",
      action: emailSent ? "email_sent" : "email_failed",
      metadata: { emailError },
    });
  }

  let smsSent = false;
  let smsError: string | null = null;
  if (wantsSms && recipientPhoneRaw) {
    const r = await sendSignLinkSms({
      toRaw: recipientPhoneRaw,
      documentLabel: title,
      link: signUrl,
    });
    if (r.ok) smsSent = true;
    else smsError = r.error;
    await supabaseAdmin
      .from("signature_packets")
      .update({
        sms_sent_at: smsSent ? new Date().toISOString() : null,
        sms_error: smsError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", packet.id);
    await logSignatureEvent({
      packetId: packet.id,
      actor: "system",
      action: smsSent ? "sms_sent" : "sms_failed",
      metadata: { smsError },
    });
  }

  await insertAuditLogTrusted({
    action: "pdf_sign_packet_sent",
    entityType: "signature_packet",
    entityId: packet.id,
    metadata: {
      template_id: template.id,
      recipient_type: recipientType,
      sms_requested: wantsSms,
    },
  });

  await logSignatureEvent({
    packetId: packet.id,
    actor: "system",
    action: "packet_created",
    metadata: { title, template_id: template.id },
  });

  return NextResponse.json({
    ok: true,
    packetId: packet.id,
    signUrl,
    emailSent,
    emailError,
    smsSent,
    smsError,
    expiresAt,
    documentTitle: title,
  });
}
