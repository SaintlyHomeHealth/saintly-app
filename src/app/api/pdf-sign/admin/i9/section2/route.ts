import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { PDF_SIGN_BUCKETS } from "@/lib/pdf-sign/constants";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import { renderPacketDocumentPreview } from "@/lib/pdf-sign/render-packet-document";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { i9CaseId?: string; values?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const i9CaseId = body.i9CaseId?.trim();
  if (!i9CaseId || !body.values || typeof body.values !== "object") {
    return NextResponse.json({ error: "Missing i9CaseId or values." }, { status: 400 });
  }

  const { data: i9, error: iErr } = await supabaseAdmin
    .from("i9_cases")
    .select("id, workflow_phase, section1_packet_id")
    .eq("id", i9CaseId)
    .maybeSingle();
  if (iErr || !i9?.section1_packet_id) {
    return NextResponse.json({ error: "I-9 case not found." }, { status: 404 });
  }
  if (i9.workflow_phase !== "section2") {
    return NextResponse.json({ error: "I-9 case is not awaiting employer Section 2." }, { status: 409 });
  }

  const packetId = i9.section1_packet_id;
  const { data: packetDocument, error: pdErr } = await supabaseAdmin
    .from("signature_packet_documents")
    .select("id, template_id")
    .eq("packet_id", packetId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pdErr || !packetDocument) {
    return NextResponse.json({ error: "Packet document not found." }, { status: 404 });
  }

  const { data: fields } = await supabaseAdmin
    .from("signature_template_fields")
    .select("id, field_key, field_type")
    .eq("template_id", packetDocument.template_id);

  const now = new Date().toISOString();

  for (const [key, raw] of Object.entries(body.values)) {
    const field = fields?.find((f) => f.field_key === key);
    if (!field) continue;
    const textValue =
      field.field_type === "checkbox"
        ? raw === true || raw === "true" || raw === "yes" || raw === "on"
          ? "true"
          : "false"
        : typeof raw === "boolean"
          ? raw
            ? "true"
            : "false"
          : String(raw ?? "").trim();
    await supabaseAdmin.from("signature_field_values").upsert(
      {
        packet_document_id: packetDocument.id,
        template_field_id: field.id,
        recipient_id: null,
        set_by_staff_user_id: user.id,
        text_value: textValue,
        bool_value: field.field_type === "checkbox" ? textValue === "true" : null,
        updated_at: now,
      },
      { onConflict: "packet_document_id,template_field_id" }
    );
  }

  let pdfBytes: Uint8Array;
  let sha256: string;
  try {
    const rendered = await renderPacketDocumentPreview(packetDocument.id);
    pdfBytes = rendered.pdfBytes;
    sha256 = rendered.sha256;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Render failed." },
      { status: 500 }
    );
  }

  const objectPath = `packets/${packetId}/doc-${packetDocument.id}-i9-final.pdf`;
  const { error: upErr } = await supabaseAdmin.storage.from(PDF_SIGN_BUCKETS.i9).upload(objectPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("signature_packet_documents")
    .update({
      completed_storage_bucket: PDF_SIGN_BUCKETS.i9,
      completed_storage_path: objectPath,
      completed_sha256: sha256,
      updated_at: now,
    })
    .eq("id", packetDocument.id);

  await supabaseAdmin
    .from("signature_packets")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", packetId);

  await supabaseAdmin
    .from("i9_cases")
    .update({
      workflow_phase: "completed",
      section2_completed_by_staff_user_id: user.id,
      section2_completed_at: now,
      updated_at: now,
    })
    .eq("id", i9CaseId);

  await logSignatureEvent({
    packetId,
    recipientId: null,
    actor: "staff",
    actorStaffUserId: user.id,
    action: "admin_complete",
    templateVersion: null,
    documentHash: sha256,
    metadata: { i9_case_id: i9CaseId, object_path: objectPath },
  });

  await insertAuditLogTrusted({
    action: "pdf_sign_i9_section2_completed",
    entityType: "i9_case",
    entityId: i9CaseId,
    metadata: { packet_id: packetId, sha256 },
  });

  return NextResponse.json({ ok: true, packetDocumentId: packetDocument.id });
}
