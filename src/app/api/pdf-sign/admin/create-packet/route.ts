import { NextResponse } from "next/server";

import { insertAuditLogTrusted } from "@/lib/audit-log";
import { sendPdfSignLinkEmail } from "@/lib/email/send-pdf-sign-email";
import { buildPdfSignRecipientUrl } from "@/lib/pdf-sign/app-url";
import { createRawSignToken, hashSignToken } from "@/lib/pdf-sign/token";
import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

type Body = {
  templateId?: string;
  crmEntityType?: string;
  crmEntityId?: string;
  recipientEmail?: string;
  recipientName?: string;
  ttlDays?: number;
  sendEmail?: boolean;
  marksIcAgreement?: boolean;
  i9ReviewMethod?: string | null;
};

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
  const crmEntityType = body.crmEntityType?.trim();
  const crmEntityId = body.crmEntityId?.trim();
  const recipientEmail = body.recipientEmail?.trim().toLowerCase();
  const recipientName = body.recipientName?.trim() || null;
  const ttlDays = typeof body.ttlDays === "number" && body.ttlDays > 0 ? Math.min(body.ttlDays, 90) : 14;
  const sendEmail = body.sendEmail === true;
  const marksIcAgreement = body.marksIcAgreement === true;

  if (!templateId || !crmEntityType || !crmEntityId || !recipientEmail || !recipientEmail.includes("@")) {
    return NextResponse.json({ error: "Missing template, CRM entity, or recipient email." }, { status: 400 });
  }

  if (!["applicant", "lead", "contact", "vendor"].includes(crmEntityType)) {
    return NextResponse.json({ error: "Invalid CRM entity type." }, { status: 400 });
  }

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
    if (crmEntityType !== "applicant") {
      return NextResponse.json({ error: "I-9 is limited to employee (applicant) records." }, { status: 400 });
    }
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
  const metadata: Record<string, unknown> = {};
  if (marksIcAgreement) metadata.marks_ic_agreement = true;

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

  const rawToken = createRawSignToken();
  const tokenHash = hashSignToken(rawToken);

  const { error: recErr } = await supabaseAdmin.from("signature_recipients").insert({
    packet_id: packet.id,
    email: recipientEmail,
    display_name: recipientName,
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
