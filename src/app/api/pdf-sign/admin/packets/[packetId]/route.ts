import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { logSignatureEvent } from "@/lib/pdf-sign/log-event";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export async function GET(
  _request: Request,
  context: { params: Promise<{ packetId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { packetId } = await context.params;
  if (!packetId) return NextResponse.json({ error: "Missing packet id" }, { status: 400 });

  const { data: packet, error } = await supabaseAdmin
    .from("signature_packets")
    .select(
      "id, status, primary_document_type, title, message, recipient_type, recipient_record_id, recipient_name, recipient_email, recipient_phone, sms_requested, sms_sent_at, sms_error, expires_at, sent_at, viewed_at, completed_at, voided_at, void_reason, canceled_at, canceled_by, cancel_reason, deleted_at, deleted_by, created_at, updated_at, completed_pdf_storage_path, completed_pdf_storage_bucket"
    )
    .eq("id", packetId)
    .maybeSingle();
  if (error || !packet) return NextResponse.json({ error: "Packet not found." }, { status: 404 });

  const { data: docs } = await supabaseAdmin
    .from("signature_packet_documents")
    .select(
      "id, template_id, template_version_snapshot, completed_storage_bucket, completed_storage_path, completed_sha256"
    )
    .eq("packet_id", packetId)
    .order("sort_order", { ascending: true });

  const templateIds = (docs || []).map((d) => d.template_id);
  const { data: templates } = templateIds.length
    ? await supabaseAdmin
        .from("signature_templates")
        .select("id, name, document_type")
        .in("id", templateIds)
    : { data: [] as Array<{ id: string; name: string; document_type: string }> };

  const { data: events } = await supabaseAdmin
    .from("signature_events")
    .select("id, actor, action, metadata, created_at, ip_address, user_agent")
    .eq("packet_id", packetId)
    .order("created_at", { ascending: false })
    .limit(60);

  const { data: recipients } = await supabaseAdmin
    .from("signature_recipients")
    .select("id, email, display_name, phone, last_viewed_at, signed_at, token_expires_at")
    .eq("packet_id", packetId);

  return NextResponse.json({
    packet,
    documents: docs || [],
    templates: templates || [],
    events: events || [],
    recipients: recipients || [],
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ packetId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { packetId } = await context.params;
  if (!packetId) return NextResponse.json({ error: "Missing packet id" }, { status: 400 });

  const now = new Date().toISOString();

  const { data: row } = await supabaseAdmin
    .from("signature_packets")
    .select("id, deleted_at")
    .eq("id", packetId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Packet not found." }, { status: 404 });
  if (row.deleted_at) {
    return NextResponse.json({ ok: true, already: true });
  }

  const { error } = await supabaseAdmin
    .from("signature_packets")
    .update({ deleted_at: now, deleted_by: user.id, updated_at: now })
    .eq("id", packetId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logSignatureEvent({
    packetId,
    actor: "staff",
    actorStaffUserId: user.id,
    action: "soft_delete",
    metadata: {},
  });
  await insertAuditLogTrusted({
    action: "pdf_sign_packet_soft_deleted",
    entityType: "signature_packet",
    entityId: packetId,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
